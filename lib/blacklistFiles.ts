import { isSamePerson, type BlacklistKey } from '@/lib/blacklist';
import { normalizeOrderKey } from '@/lib/insurance';

/**
 * 명단에 오른 사람이 어느 파일에서 몇 번 신청했는지 찾는다.
 *
 * 신청 한 건이 한 줄이다 — 신청횟수가 3회면 출처 파일도 세 줄이어야
 * 관리자가 숫자와 목록을 대조할 수 있다.
 *
 * 판정과 같은 함수(isSamePerson)를 쓴다. 여기서만 다른 기준을 쓰면 화면에
 * 뜨는 파일과 실제로 걸린 파일이 갈린다.
 */

/** 파일 한 행. 신청을 세는 단위가 주문번호라 그것도 같이 들고 있어야 한다. */
export interface SourceFileRow {
  key: BlacklistKey;
  orderNo: string;
  /** 그 행에 적힌 이름. 판정에는 안 쓰지만 왜 한 사람으로 묶였는지 보여준다. */
  customerName: string;
  product: string;
}

/** 훑어볼 파일 하나 */
export interface SourceFile {
  id: string;
  name: string;
  rows: SourceFileRow[];
}

/**
 * 화면에 한 줄로 나갈 신청 한 건.
 *
 * 표에서는 파일 이름만 쓰고, 신청내역 모달에서는 나머지까지 펼쳐 보여준다.
 * 이름이 서로 다른 행이 한 사람으로 묶이는 일이 흔해서(번호만 보고 판정한다)
 * 그 행에 적힌 이름을 같이 보여줘야 왜 묶였는지 알 수 있다.
 */
export interface SourceFileHit {
  id: string | null;
  name: string;
  orderNo?: string;
  customerName?: string;
  product?: string;
}

/**
 * 이 사람의 신청 건을 파일에서 찾아 한 건에 한 줄씩 돌려준다.
 *
 * 주문번호가 같으면 같은 신청이다. 같은 파일을 두 번 올렸을 때 두 건으로
 * 세지 않으려는 것으로, 신청횟수를 세는 규칙(주문번호 중복 제거)과 같다.
 * 규칙이 어긋나면 '3회'라고 적힌 옆에 여섯 줄이 뜬다.
 */
export function findSourceFiles(
  key: BlacklistKey,
  files: SourceFile[]
): SourceFileHit[] {
  const seen = new Set<string>();
  const hits: SourceFileHit[] = [];

  for (const file of files) {
    for (const row of file.rows) {
      if (!isSamePerson(key, row.key)) continue;

      // 주문번호가 없는 행은 묶을 근거가 없으니 각각 한 건으로 둔다.
      const orderNo = normalizeOrderKey(row.orderNo);
      const dedupeKey = orderNo || `${file.id}#${hits.length}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      hits.push({
        id: file.id,
        name: file.name,
        orderNo,
        customerName: row.customerName,
        product: row.product,
      });
    }
  }

  return hits;
}

/** 걸린 파일이 없을 때 되돌아갈 자리 */
export interface RecordWithSource {
  source_file_id: string | null;
  source_file_name: string | null;
}

/**
 * 명단 전체에 출처 목록을 붙인다.
 *
 * 행을 쪼개지 않는다. 사람 한 명이 표에서 한 줄이어야 신청횟수·사유·해제 버튼이
 * 그 사람 것으로 읽힌다. 출처만 그 칸 안에서 여러 줄이 된다.
 */
export function attachSourceFiles<T extends RecordWithSource>(
  records: T[],
  toKey: (record: T) => BlacklistKey,
  files: SourceFile[]
): Array<T & { source_files: SourceFileHit[] }> {
  return records.map((record) => {
    const hits = findSourceFiles(toKey(record), files);

    return {
      ...record,
      // 파일에서 못 찾으면 등록 당시의 출처를 그대로 쓴다. 파일이 지워졌거나
      // 관리자가 손으로 올린 건이 여기 해당한다.
      source_files:
        hits.length > 0
          ? hits
          : [{ id: record.source_file_id, name: record.source_file_name || '-' }],
    };
  });
}
