import { NextRequest, NextResponse } from 'next/server';
import { isAdminRole } from '@/lib/roles';
import { getUserFromRequest } from '@/lib/jwt';
import { checkUserFileDepartmentMatch } from '@/lib/files';
import { createClient } from '@supabase/supabase-js';
import { fitColumnWidths } from '@/lib/excelCell';
import {
  ASSIGNED_BY_COLUMN,
  ASSIGNED_AT_COLUMN,
  formatAssignedAt,
} from '@/lib/insurance';
import * as XLSX from 'xlsx';
import { extractDeviceInfo } from '@/lib/deviceInfo';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const STORAGE_BUCKET = 'files';

/** 선점해 둔 다운로드 기록을 되돌린다. 파일을 못 준 채로 한도만 깎이면 안 된다. */
async function releaseReservedRecord(recordId: number | null) {
  if (recordId === null) return;

  const { error } = await supabase.from('download_records').delete().eq('id', recordId);
  if (error) {
    // 여기서 실패하면 사용자는 한도 1회를 손해 본다. 관리자가 승인으로 풀어줄 수 있으므로
    // 요청 자체를 막지는 않고 흔적만 남긴다.
    console.error('Failed to release reserved download record:', recordId, error);
  }
}

/**
 * 워크북의 모든 시트에 열 너비를 보장한다.
 *
 * 다운로드는 시트 하나만 다시 만들어 붙이므로, 손대지 않은 시트(원본·중복)는
 * 너비 없이 나간다. 그러면 그 시트의 날짜 칸이 ########으로 보인다.
 * 내보내기 직전에 한 번 훑어 빠진 시트를 채운다.
 */
function ensureColumnWidths(workbook: XLSX.WorkBook) {
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;

    // 저장돼 있던 너비는 그대로 쓰지 않는다. 빈 열이 앞에 있는 시트에서는
    // 그때 계산한 값이 열과 한 칸씩 어긋나 엉뚱한 열이 좁아진다.
    // 지금 내보내는 내용 기준으로 다시 잡는 편이 항상 맞다.
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true }) as unknown[][];
    sheet['!cols'] = fitColumnWidths(rows);
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // 스토리지 다운로드 전에 미리 잡아둔 기록. 이후 단계가 실패하면 되돌려야 한다.
  let reservedRecordId: number | null = null;
  // 이 사람이 이 파일을 받고 난 뒤의 버튼 상태. 응답 헤더로 알려줘서
  // 화면이 목록을 통째로 다시 받지 않고 그 줄만 고칠 수 있게 한다.
  // 다시 받으면 상태가 바뀐 줄이 정렬 규칙에 따라 자리를 옮겨,
  // 방금 누른 줄이 눈앞에서 사라진다.
  let statusAfterDownload: string | null = null;

  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: fileId } = await params;

    // 파일 메타데이터 조회 (file_content 포함)
    let { data: file, error: queryError } = await supabase
      .from('files')
      .select('id, name, storage_path, mime_type, download_count, department_id, is_original, file_content, uploaded_at')
      .eq('id', fileId)
      .single();

    // 파일이 없으면 deleted_files에서 찾기 (삭제된 파일도 다운로드 가능하게)
    if (queryError || !file) {
      const { data: deletedFile } = await supabase
        .from('deleted_files')
        .select('id, name, storage_path, mime_type, file_content, uploaded_at')
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
    if (!isAdminRole(user.role)) {
      // 원본 파일은 admin/subadmin만 접근 가능
      if (file.is_original) {
        return NextResponse.json({ error: 'Forbidden: is_original' }, { status: 403 });
      }

      // 부서 일치 검사
      const deptCheck = await checkUserFileDepartmentMatch(user.id, fileId);
      if (!deptCheck.success) {
        return NextResponse.json({ error: deptCheck.error }, { status: 403 });
      }

      // 다운로드 허용량 체크 (1회 기본 + 승인된 재다운로드 개수).
      // head:true + count로 세야 PostgREST 행 상한에 걸려 적게 세는 일이 없다.
      const { count: downloadCountRaw } = await supabase
        .from('download_records')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('file_id', fileId);

      const downloadCount = downloadCountRaw || 0;

      const { count: approvedCountRaw } = await supabase
        .from('redownload_requests')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('file_id', fileId)
        .eq('status', 'approved');

      const allowed = 1 + (approvedCountRaw || 0);

      if (downloadCount >= allowed) {
        return NextResponse.json(
          { error: '이 파일은 이미 다운로드하셨습니다. "재다운로드 요청" 버튼으로 관리자의 승인을 요청해주세요.', code: 'DOWNLOAD_LIMIT_REACHED' },
          { status: 403 }
        );
      }

      // 스토리지를 건드리기 전에 자리를 먼저 잡는다.
      // 세고 나서 받고 마지막에 기록하면, 동시에 들어온 두 요청이 둘 다 검사를 통과해
      // 1회 권한으로 2번 받을 수 있다. attempt_no 유니크 제약이 그 중 하나를 반드시 떨군다.
      const { data: downloader } = await supabase
        .from('users')
        .select('department, name, employee_id')
        .eq('id', user.id)
        .single();

      const deviceInfo = extractDeviceInfo(request);

      const { data: reserved, error: reserveError } = await supabase
        .from('download_records')
        .insert({
          file_id: fileId,
          user_id: user.id,
          attempt_no: downloadCount + 1,
          file_name: file.name,
          downloaded_by: user.username,
          user_name: downloader?.name || null,
          user_employee_id: downloader?.employee_id || null,
          user_department: downloader?.department || null,
          downloaded_at: new Date().toISOString(),
          file_content: file.file_content || [],
          ip_address: deviceInfo.ip_address,
          device_type: deviceInfo.device_type,
          os_name: deviceInfo.os_name,
          browser_name: deviceInfo.browser_name,
          source: 'download',
        })
        .select('id')
        .single();

      if (reserveError) {
        // 23505 = unique_violation. 같은 회차를 다른 요청이 먼저 가져갔다는 뜻이다.
        if (reserveError.code === '23505') {
          return NextResponse.json(
            { error: '이미 처리 중인 다운로드가 있습니다. 잠시 후 다시 시도해주세요.', code: 'DOWNLOAD_LIMIT_REACHED' },
            { status: 409 }
          );
        }
        console.error('Failed to reserve download slot:', reserveError);
        return NextResponse.json({ error: '파일 다운로드에 실패했습니다.' }, { status: 500 });
      }

      reservedRecordId = reserved.id;

      // 이번 다운로드까지 센 뒤의 상태. files/list의 계산과 같은 규칙을 쓴다.
      if (downloadCount + 1 < allowed) {
        statusAfterDownload = 'available';
      } else {
        // 한도를 다 썼다. 마지막 요청이 거부된 상태였다면 그 사실을 그대로 보여준다.
        const { data: latest } = await supabase
          .from('redownload_requests')
          .select('status')
          .eq('user_id', user.id)
          .eq('file_id', fileId)
          .order('requested_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        statusAfterDownload = latest?.status === 'rejected' ? 'rejected' : 'downloaded';
      }
    }

    // Supabase Storage에서 파일 다운로드
    const { data: fileData, error: downloadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .download(file.storage_path);

    if (downloadError || !fileData) {
      console.error('Storage download error:', downloadError);
      // 못 받았으니 잡아둔 자리를 돌려준다. 안 그러면 한도만 소진된다.
      await releaseReservedRecord(reservedRecordId);
      return NextResponse.json({ error: '파일 다운로드에 실패했습니다.' }, { status: 500 });
    }

    // 배정날짜는 이 건이 넘어간 때, 곧 배포 시각이다. 받는 시각을 쓰면 같은 파일을
    // 내일 받았을 때 내일 날짜가 찍혀 받는 쪽이 보는 값이 사실과 달라진다.
    //
    // 배포할 때 행마다 저장해 두므로 그 값을 그대로 쓴다. 배포본의 uploaded_at은
    // '원본을 올린 시각'이라 배정 시각과 다를 수 있어 그것으로 대신하면 어긋난다.
    const storedContent = Array.isArray(file.file_content) ? file.file_content : [];
    const storedAssignedAt = storedContent.find((r: any) => r?.[ASSIGNED_AT_COLUMN])?.[ASSIGNED_AT_COLUMN];
    const assignedAt =
      storedAssignedAt ??
      formatAssignedAt(file.uploaded_at ? new Date(file.uploaded_at) : new Date());

    // 엑셀 재생성: 번호와 배정날짜 추가
    let outputBuffer: Buffer;
    try {
      const buffer = await fileData.arrayBuffer();
      const uint8Array = new Uint8Array(buffer);
      // cellDates가 없으면 날짜가 46245 같은 일련번호로 내려간다.
      // cellStyles가 없으면 저장돼 있던 열 너비를 읽는 순간 버린다.
      const workbook = XLSX.read(uint8Array, { type: 'array', cellDates: true, cellStyles: true });

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
          // 시트를 새로 만들면 저장돼 있던 열 너비가 함께 버려진다.
          // 다시 잡아주지 않으면 날짜 칸이 ########으로 나간다.
          sheet2['!cols'] = fitColumnWidths(dataWithAssignedAt);
          workbook.Sheets[sheet2Name] = sheet2;
        }

        ensureColumnWidths(workbook);
        outputBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      } else {
        // 배포 파일: 첫 시트에 번호와 배정날짜 추가
        const sheetName = workbook.SheetNames[0];
        const sheetData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 }) as any[][];

        if (sheetData.length > 0) {
          const headers = sheetData[0];
          const rows = sheetData.slice(1);

          // 배정방식은 관리자에게만 보여준다. 소속 사용자는 자기 소속 건을 처리하면
          // 될 뿐, 그 건이 규칙으로 왔는지 관리자가 골랐는지 알 필요가 없다.
          // 값은 배포할 때 file_content에 저장해 뒀다 (엑셀 파일에는 없다).
          const content = storedContent;
          const showAssignedBy =
            (isAdminRole(user.role)) &&
            content.some((r: any) => r?.[ASSIGNED_BY_COLUMN]);

          const numberedData = [
            ['번호', ...headers, ...(showAssignedBy ? [ASSIGNED_BY_COLUMN] : []), '배정날짜'],
          ];
          rows.forEach((row, idx) => {
            // file_content는 배포할 때 같은 순서로 만들었으므로 번호로 짝이 맞는다.
            const assignedBy = showAssignedBy ? content[idx]?.[ASSIGNED_BY_COLUMN] ?? '' : null;
            numberedData.push([
              idx + 1,
              ...row,
              ...(showAssignedBy ? [assignedBy] : []),
              assignedAt,
            ]);
          });

          const sheet = XLSX.utils.aoa_to_sheet(numberedData, { cellDates: true, dateNF: 'yyyy-mm-dd' });
          // 시트를 새로 만들면 저장돼 있던 열 너비가 함께 버려진다.
          // 다시 잡아주지 않으면 날짜 칸이 ########으로 나간다.
          sheet['!cols'] = fitColumnWidths(numberedData);
          workbook.Sheets[sheetName] = sheet;
        }

        ensureColumnWidths(workbook);
        outputBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      }
    } catch (excelError) {
      console.error('Excel generation error:', excelError);
      // 엑셀 재생성 실패 시 원본 파일 그대로 반환
      outputBuffer = Buffer.from(await fileData.arrayBuffer());
    }

    // 다운로드 기록은 위에서 이미 선점해 뒀다. 여기서는 집계만 올린다.
    // 읽은 값에 +1을 써 넣으면 동시 요청 중 한쪽 증가분이 덮여 사라지므로 DB에서 더한다.
    if (!isAdminRole(user.role)) {
      const { error: incrementError } = await supabase.rpc('increment_file_download_count', {
        p_file_id: fileId,
      });

      if (incrementError) {
        // 표시용 집계라 실패해도 파일은 내보낸다. 실제 횟수는 download_records가 갖고 있다.
        console.error('Failed to increment download count:', fileId, incrementError);
      }
    }

    const response = new NextResponse(outputBuffer as any);
    response.headers.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    response.headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(file.name)}"`);
    if (statusAfterDownload) {
      response.headers.set('X-My-Download-Status', statusAfterDownload);
      // 브라우저 fetch는 기본적으로 몇 개 헤더만 읽게 해준다. 직접 열어줘야 보인다.
      response.headers.set('Access-Control-Expose-Headers', 'X-My-Download-Status');
    }
    return response;
  } catch (error) {
    console.error('File download error:', error);
    // 응답을 못 내보냈으므로 잡아둔 자리를 돌려준다.
    await releaseReservedRecord(reservedRecordId);
    return NextResponse.json({ error: '파일 다운로드에 실패했습니다.' }, { status: 500 });
  }
}
