import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/jwt';
import { verifyCsrfToken } from '@/lib/csrf';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { formatCellValue } from '@/lib/excelCell';
import * as XLSX from 'xlsx';
import {
  getInsurerTypeFromRows,
  findRequiredColumns,
  isValidUploadFileName,
  UPLOAD_FILE_NAME_HINT,
} from '@/lib/insurance';

const MAX_FILE_SIZE = 300 * 1024 * 1024; // 300MB
const STORAGE_BUCKET = 'files';

// 확장자별 허용 매직 넘버 (파일 내용 기반 검증)
const ALLOWED_EXTENSIONS = ['xlsx', 'xls', 'csv'] as const;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// 업로드된 바이트가 확장자와 실제로 일치하는지 확인한다.
// 확장자만 믿으면 실행 파일을 .xlsx로 위장해 올릴 수 있다.
function matchesExtension(bytes: Uint8Array, ext: string) {
  const startsWith = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);

  if (ext === 'xlsx') return startsWith(0x50, 0x4b); // ZIP (OOXML)
  if (ext === 'xls') return startsWith(0xd0, 0xcf, 0x11, 0xe0); // OLE2
  if (ext === 'csv') {
    // CSV는 시그니처가 없으므로 NUL 바이트가 없는 텍스트인지로 판단한다.
    return !bytes.subarray(0, 8192).includes(0x00);
  }
  return false;
}

export async function POST(request: NextRequest) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Only admin can upload files' }, { status: 403 });
    }

    // CSRF 토큰 검증
    if (!verifyCsrfToken(request)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // 파일 크기 검증 (0바이트도 거부)
    if (file.size === 0) {
      return NextResponse.json({ error: 'Empty file' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: `File size must not exceed ${MAX_FILE_SIZE / (1024 * 1024)}MB` }, { status: 400 });
    }

    // 파일명 검증: 경로 조작(../, /, \)과 제어문자·NUL 차단
    const originalName = file.name;
    if (
      originalName.length > 255 ||
      originalName.includes('..') ||
      originalName.includes('/') ||
      originalName.includes('\\') ||
      /[\x00-\x1f]/.test(originalName)
    ) {
      return NextResponse.json({ error: 'Invalid file name' }, { status: 400 });
    }

    // 파일명 규칙. 화면과 같은 함수를 써야 한다 — 서버가 느슨하면 화면이 거부한
    // 파일이 API로 들어와, 보험사를 못 가려 배포에서 막힐 파일이 이미 저장된 뒤가 된다.
    if (!isValidUploadFileName(originalName)) {
      return NextResponse.json({ error: UPLOAD_FILE_NAME_HINT }, { status: 400 });
    }

    const ext = originalName.toLowerCase().split('.').pop() || '';
    if (!ALLOWED_EXTENSIONS.includes(ext as (typeof ALLOWED_EXTENSIONS)[number])) {
      return NextResponse.json({ error: 'Only Excel files are allowed' }, { status: 400 });
    }

    // 파일 버퍼 읽기 후 내용 기반 검증
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!matchesExtension(bytes, ext)) {
      return NextResponse.json({ error: 'File content does not match its extension' }, { status: 400 });
    }

    // 파일 ID 생성
    const fileId = uuidv4();
    const now = new Date();
    const timestamp = now.toISOString();
    const dateStr = timestamp.slice(0, 10);

    // 타임스탐프로 충돌 방지 (Storage는 영문/숫자만, 한글은 DB에 보존)
    const timeStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}${String(now.getMilliseconds()).padStart(3, '0')}`;

    // 파일 내용 인덱싱 + 보험사 판정: XLSX 파싱해서 모든 행을 JSON으로 저장
    let fileContent: any[] = [];
    let insurerType: 'hk' | 'dy' | null = null;
    try {
      // cellDates가 없으면 날짜가 일련번호로 색인돼 검색이 안 된다.
      const workbook = XLSX.read(bytes, { type: 'array', cellDates: true });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as string[][];

      // JSON 형식으로 변환. 날짜는 사람이 검색하는 모양(2026-08-11)으로 색인한다.
      // Date를 그대로 두면 UTC ISO로 저장돼 하루 어긋난 값으로 검색된다.
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];
      fileContent = jsonData.map((row) =>
        Object.fromEntries(Object.entries(row).map(([k, v]) => [k, formatCellValue(v)]))
      );

      // 보험사 판정: 상품명 컬럼 찾기
      // 원본 A열은 헤더가 비어 있어 sheet_to_json이 구멍 뚫린 희소 배열을 준다.
      // map은 구멍을 건너뛰어 그대로 남기므로 Array.from으로 실제 값을 채운다.
      if (aoa.length >= 2) {
        const headerRow = Array.from(aoa[0] ?? [], (h) => String(h ?? ''));
        // 컬럼 매칭 규칙은 findRequiredColumns 한 곳에만 둔다.
        const { productCol } = findRequiredColumns(headerRow);
        const productIdx = productCol ? headerRow.indexOf(productCol) : -1;

        if (productIdx >= 0) {
          const dataRows = aoa
            .slice(1)
            .map((row) => Array.from(row ?? [], (cell) => String(cell ?? '')));
          insurerType = getInsurerTypeFromRows(dataRows, productIdx);
        }
      }
    } catch (parseError) {
      // 파싱 실패해도 업로드는 진행 (file_content는 빈 배열, insurerType은 null)
    }

    // Storage 경로: 보험사 → 업로더 순. 배포본(dept/)과 같은 순서로 맞춘다.
    const insurerPath = insurerType || 'unknown';
    const finalFilePath = `admin/${insurerPath}/${user.id}/${dateStr}/${timeStr}.${ext}`;

    // Storage 경로 업데이트 (보험사 구분 추가)
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(finalFilePath, bytes, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: '파일 업로드에 실패했습니다.' }, { status: 500 });
    }

    // 원본이 들어갈 자리는 is_admin 표시로 찾는다.
    // id를 박으면 DB를 다시 만들 때, 이름으로 찾으면 소속명을 바꿀 때 깨진다.
    const { data: adminDept } = await supabase
      .from('departments')
      .select('id')
      .eq('is_admin', true)
      .single();

    if (!adminDept) {
      await supabase.storage.from(STORAGE_BUCKET).remove([finalFilePath]);
      return NextResponse.json(
        { error: '원본을 담을 관리자 소속이 지정돼 있지 않아 업로드할 수 없습니다.' },
        { status: 500 }
      );
    }

    // 파일 메타데이터를 데이터베이스에 저장 (원본으로 표시, 소속: 관리자)
    const { error: dbError } = await supabase.from('files').insert([
      {
        id: fileId,
        name: originalName,
        size: file.size,
        mime_type: file.type || 'application/octet-stream',
        storage_path: finalFilePath,
        uploaded_by: user.id,
        uploaded_at: timestamp,
        is_original: true,
        department_id: adminDept.id,
        file_content: fileContent,
        insurer_type: insurerType,
      },
    ]);

    if (dbError) {
      // 메타데이터가 없으면 추적 불가능한 고아 파일이 되므로 롤백한다.
      await supabase.storage.from(STORAGE_BUCKET).remove([finalFilePath]);
      return NextResponse.json({ error: '파일 업로드에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({
      fileId,
      fileName: originalName,
      size: file.size,
      uploadedAt: timestamp,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
  }
}
