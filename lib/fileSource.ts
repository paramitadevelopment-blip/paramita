/**
 * 파일 관련 기록(다운로드 로그·파일 삭제 히스토리)이 어느 화면에서
 * 났는지 보여줄 라벨. download_records.source와 deleted_files.source가
 * 값 종류는 다르지만(download/file_transfer vs direct/file_transfer)
 * 키가 겹치지 않아 한 맵으로 같이 둔다 — 화면마다 문구가 다르게 적히면
 * 같은 출처를 다르게 읽는다.
 */
export const FILE_SOURCE_LABEL: Record<string, string> = {
  direct: '원본파일 관리',
  download: '파일 다운로드',
  file_transfer: '파일전달',
};
