import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/jwt';
import { verifyCsrfToken } from '@/lib/csrf';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';

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

    // 파일명이 YYYYMMDD 형식으로 시작하는지 검증
    if (!/^\d{8}/.test(originalName)) {
      return NextResponse.json({ error: '파일명은 반드시 YYYYMMDD 형식의 날짜로 시작해야 합니다. (예: 20260815_파일명.xlsx)' }, { status: 400 });
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
    const filePath = `admin/${user.id}/${dateStr}/${timeStr}.${ext}`;

    // Supabase Storage에 업로드
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, bytes, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });

    if (uploadError) {
      console.error('Storage upload error:', { uploadError, fileName: originalName, userId: user.id });
      return NextResponse.json({ error: '파일 업로드에 실패했습니다.' }, { status: 500 });
    }

    // 파일 내용 인덱싱: XLSX 파싱해서 모든 행을 JSON으로 저장
    let fileContent: any[] = [];
    try {
      const workbook = XLSX.read(bytes, { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];
      fileContent = jsonData;
    } catch (parseError) {
      console.warn('File parsing warning (search will not work for this file):', { parseError, fileName: originalName });
      // 파싱 실패해도 업로드는 진행 (file_content는 빈 배열)
    }

    // 파일 메타데이터를 데이터베이스에 저장 (원본으로 표시, 소속: 관리자)
    const { error: dbError } = await supabase.from('files').insert([
      {
        id: fileId,
        name: originalName,
        size: file.size,
        mime_type: file.type || 'application/octet-stream',
        storage_path: filePath,
        uploaded_by: user.id,
        uploaded_at: timestamp,
        is_original: true,
        department_id: 15,
        file_content: fileContent,
      },
    ]);

    if (dbError) {
      console.error('Database insert error:', { dbError, fileName: originalName, userId: user.id });
      // 메타데이터가 없으면 추적 불가능한 고아 파일이 되므로 롤백한다.
      await supabase.storage.from(STORAGE_BUCKET).remove([filePath]);
      return NextResponse.json({ error: '파일 업로드에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({
      fileId,
      fileName: originalName,
      size: file.size,
      uploadedAt: timestamp,
    });
  } catch (error) {
    console.error('File upload error:', error);
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
  }
}
