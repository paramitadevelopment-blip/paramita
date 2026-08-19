import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/jwt';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const STORAGE_BUCKET = 'files';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: fileId } = await params;

    // 파일 메타데이터 조회 (file_content 포함)
    let { data: file, error: queryError } = await supabase
      .from('files')
      .select('id, name, storage_path, mime_type, download_count, department_id, is_original, file_content')
      .eq('id', fileId)
      .single();

    // 파일이 없으면 deleted_files에서 찾기 (삭제된 파일도 다운로드 가능하게)
    if (queryError || !file) {
      const { data: deletedFile } = await supabase
        .from('deleted_files')
        .select('id, name, storage_path, mime_type, file_content')
        .eq('id', fileId)
        .single();

      if (!deletedFile) {
        return NextResponse.json({ error: 'File not found' }, { status: 404 });
      }

      file = {
        ...deletedFile,
        download_count: 0,
        department_id: null,
        is_original: false,
      };
    }

    // 일반 사용자의 파일 접근 제한: 본인 부서 파일만 다운로드 가능
    if (user.role !== 'admin') {
      // 원본 파일은 admin만 접근 가능
      if (file.is_original) {
        return NextResponse.json({ error: 'Forbidden: is_original' }, { status: 403 });
      }

      // 일반 사용자는 본인 부서 파일만 접근 가능
      // 1. 사용자의 부서 조회
      const { data: userDept } = await supabase
        .from('users')
        .select('department')
        .eq('id', user.id)
        .single();


      if (!userDept?.department) {
        return NextResponse.json({ error: 'Forbidden: no_user_dept' }, { status: 403 });
      }

      // 2. 파일의 부서 ID로부터 부서명 조회
      const { data: fileDept } = await supabase
        .from('departments')
        .select('name')
        .eq('id', file.department_id)
        .single();


      // 3. 사용자 부서와 파일 부서 비교
      if (!fileDept) {
        return NextResponse.json({ error: 'Forbidden: no_file_dept' }, { status: 403 });
      }

      if (fileDept.name !== userDept.department) {
        return NextResponse.json({ error: 'Forbidden: dept_mismatch' }, { status: 403 });
      }
    }

    // Supabase Storage에서 파일 다운로드
    const { data: fileData, error: downloadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .download(file.storage_path);

    if (downloadError || !fileData) {
      console.error('Storage download error:', downloadError);
      return NextResponse.json({ error: '파일 다운로드에 실패했습니다.' }, { status: 500 });
    }

    // 배정날짜
    const now = new Date();
    const assignedAt = `${now.toLocaleDateString('ko-KR').slice(0, -1)} ${now.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })}`;

    // 엑셀 재생성: 번호와 배정날짜 추가
    let outputBuffer: Buffer;
    try {
      const buffer = await fileData.arrayBuffer();
      const uint8Array = new Uint8Array(buffer);
      // cellDates가 없으면 날짜가 46245 같은 일련번호로 내려간다.
      const workbook = XLSX.read(uint8Array, { type: 'array', cellDates: true });

      // 원본 파일인 경우 시트 2개를 그대로 유지
      if (file.is_original && workbook.SheetNames.length >= 2) {
        // Sheet1은 그대로, Sheet2에는 배정날짜 열만 추가 (번호는 이미 있음)
        const sheet2Name = workbook.SheetNames[1];
        const sheet2Data = XLSX.utils.sheet_to_json(workbook.Sheets[sheet2Name], { header: 1 }) as any[][];

        // Sheet2에 배정날짜 열 추가 (맨 뒤)
        if (sheet2Data.length > 0) {
          const headers = sheet2Data[0];
          const rows = sheet2Data.slice(1);

          const dataWithAssignedAt = [
            [...headers, '배정날짜'],
            ...rows.map((row) => [...row, assignedAt]),
          ];

          const sheet2 = XLSX.utils.aoa_to_sheet(dataWithAssignedAt, { cellDates: true, dateNF: 'yyyy-mm-dd' });
          workbook.Sheets[sheet2Name] = sheet2;
        }

        outputBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      } else {
        // 배포 파일: 첫 시트에 번호와 배정날짜 추가
        const sheetName = workbook.SheetNames[0];
        const sheetData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 }) as any[][];

        if (sheetData.length > 0) {
          const headers = sheetData[0];
          const rows = sheetData.slice(1);

          const numberedData = [['번호', ...headers, '배정날짜']];
          rows.forEach((row, idx) => {
            numberedData.push([idx + 1, ...row, assignedAt]);
          });

          const sheet = XLSX.utils.aoa_to_sheet(numberedData, { cellDates: true, dateNF: 'yyyy-mm-dd' });
          workbook.Sheets[sheetName] = sheet;
        }

        outputBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      }
    } catch (excelError) {
      console.error('Excel generation error:', excelError);
      // 엑셀 재생성 실패 시 원본 파일 그대로 반환
      outputBuffer = Buffer.from(await fileData.arrayBuffer());
    }

    // admin이 아닌 경우에만 다운로드 기록 저장
    if (user.role !== 'admin') {
      // 소속은 토큰이 아닌 DB 기준으로 조회한다
      const { data: downloader } = await supabase
        .from('users')
        .select('department, name, employee_id')
        .eq('id', user.id)
        .single();

      await supabase
        .from('download_records')
        .insert({
          file_id: fileId,
          file_name: file.name,
          downloaded_by: user.username,
          user_name: downloader?.name || null,
          user_employee_id: downloader?.employee_id || null,
          user_department: downloader?.department || null,
          downloaded_at: new Date().toISOString(),
          file_content: file.file_content || [],
        });

      // 다운로드수 증가
      await supabase
        .from('files')
        .update({ download_count: (file.download_count || 0) + 1 })
        .eq('id', fileId);
    }

    const response = new NextResponse(outputBuffer as any);
    response.headers.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    response.headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(file.name)}"`);
    return response;
  } catch (error) {
    console.error('File download error:', error);
    return NextResponse.json({ error: '파일 다운로드에 실패했습니다.' }, { status: 500 });
  }
}
