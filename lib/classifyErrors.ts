/**
 * 분류 오류를 사람이 읽을 문장으로 묶는 규칙.
 *
 * 화면에 매인 코드가 아니라 순수 계산이라 lib에 둔다.
 * 훅의 ClassifiedFile 전체가 아니라 여기서 실제로 쓰는 세 필드만 받는다 —
 * lib이 화면 쪽 타입을 끌어오면 의존이 거꾸로 선다.
 */
export interface ErrorSummarySource {
  fileName: string;
  errorCount: number;
  errors: Array<{ row: number; reason: string }>;
}

/** 사유가 같은 행이 여러 개일 때 다 늘어놓으면 읽히지 않으므로 앞 몇 개만 짚는다. */
const MAX_ROWS_PER_REASON = 5;
/** 파일이 여러 개여도 알림 한 통에 다 담기지는 않는다. */
const MAX_REASONS = 6;

/**
 * 오류 행들을 사유별로 묶어 사람이 읽을 문장으로 만든다.
 * "3개 행에 오류" 만으로는 파일의 무엇을 고쳐야 하는지 알 수 없다.
 */
export function summarizeErrors(files: ErrorSummarySource[]): string {
  const lines: string[] = [];

  for (const file of files) {
    if (file.errorCount === 0) continue;

    // 사유 → 행 번호들
    const byReason = new Map<string, number[]>();
    for (const { row, reason } of file.errors) {
      const rows = byReason.get(reason) ?? [];
      rows.push(row);
      byReason.set(reason, rows);
    }

    // 파일이 하나뿐이면 파일명 줄은 군더더기다.
    if (files.length > 1) lines.push(`[${file.fileName}]`);

    for (const [reason, rows] of [...byReason].slice(0, MAX_REASONS)) {
      const shown = rows.slice(0, MAX_ROWS_PER_REASON).join(', ');
      const rest = rows.length > MAX_ROWS_PER_REASON ? ` 외 ${rows.length - MAX_ROWS_PER_REASON}건` : '';
      lines.push(`· ${reason} — ${rows.length}건 (${shown}행${rest})`);
    }

    if (byReason.size > MAX_REASONS) {
      lines.push(`· 그 밖에 ${byReason.size - MAX_REASONS}가지 사유가 더 있습니다.`);
    }
  }

  return lines.join('\n');
}
