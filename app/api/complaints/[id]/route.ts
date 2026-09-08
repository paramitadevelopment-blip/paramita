import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserFromRequest } from '@/lib/jwt';
import { verifyCsrfToken } from '@/lib/csrf';
import {
  canResolveUnassignedComplaints,
  canHandleComplaint,
  canRegisterComplaints,
  canViewAllComplaints,
} from '@/lib/roles';
import { isAssignableGroup } from '@/lib/departments';
import {
  COMPLAINT_COLUMNS,
  canDeleteComplaint,
  canEditComplaint,
  canWithdrawComplaint,
  complaintThreadKey,
  isOpenComplaint,
  type ComplaintLockInput,
} from '@/lib/complaints';
import { readComplaintInput, toComplaintRow } from '@/lib/complaintIntake';
import { recordTransfer } from '@/lib/complaintTransfers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * 민원 한 건을 다음 자리로 넘긴다.
 *
 * 동작이 한 곳에 있다 — 전부 "이 건을 만질 수 있는 사람인가"를 같은 방식으로
 * 물어야 하기 때문이다. 라우트를 쪼개면 그 검사도 쪼개지고, 하나만 느슨해도
 * 남의 지사 민원을 만질 수 있게 된다.
 *
 *   assign_dept   관리자가 지사를 지정한다. 못 찾은 건도, 이미 간 건을 옮기는 것도
 *   bounce        지사가 "우리 지사 건이 아니다"로 관리자에게 되돌린다
 *   return        관리자가 민원담당자에게 사유와 함께 되돌린다
 *   read          지사가 봤다고 표시한다
 *   handle        처리 내용을 적고 완료로 바꾼다
 *   update        넣은 사람이 잘못 적은 것을 고친다
 *   withdraw      넣은 사람이 보완 받은 건을 닫는다
 *
 * **끝난 건(done)과 닫힌 건(withdrawn)은 어떤 동작도 받지 않는다.** 한때
 * 처리 완료에 보완 요청이 걸리고, 철회된 건을 지사가 처리해 되살릴 수 있었다.
 * 앞으로 가는 문은 상태마다 정해져 있고, 뒤로 가는 문은 여기 둘뿐이다 —
 * 지사가 되돌리는 bounce, 관리자가 옮기는 assign_dept.
 *
 * 삭제(DELETE)도 여기 있다 — 고치기와 지우기는 "아직 아무도 손대지 않았는가"를
 * 같은 기준으로 물어야 한다.
 */

type Action = 'assign_dept' | 'bounce' | 'return' | 'handle' | 'read' | 'update' | 'withdraw';

/** 목록·상세를 만질 때 함께 봐야 하는 값. 무엇을 물어야 하는지가 여기 다 있다. */
const GUARD_COLUMNS =
  'id, status, assigned_group, assign_type, handled_at, read_at, created_by_id, thread_key, sequence_no';

/**
 * 넣은 사람이 고치거나 지울 수 있는 건인가.
 *
 * 두 가지를 함께 본다 — 내 건인가(관리자는 전체), 그리고 아무도 손대지
 * 않았는가. 화면에서도 같은 기준으로 버튼을 감추지만, 요청은 직접 만들 수 있다.
 */
function checkOwnEditable(
  complaint: ComplaintLockInput & { created_by_id: number | null },
  user: { id: number; role: string },
  intent: 'edit' | 'delete' | 'withdraw'
): NextResponse | null {
  /*
   * 넣는 자리는 사무실 공용이다. 넣을 수 있는 사람이면 누가 넣은 건이든
   * 고치고 물린다 — 관리자가 넣은 건에 보완 요청이 오면 담당자가 고쳐 보낸다.
   * 무엇을 할 수 있는지는 상태가 정한다(아래).
   */
  if (!canRegisterComplaints(user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const isAdmin = canViewAllComplaints(user.role);
  const allowed =
    intent === 'edit'
      ? canEditComplaint(complaint)
      : intent === 'withdraw'
        ? canWithdrawComplaint(complaint)
        : canDeleteComplaint(complaint, isAdmin);
  if (!allowed) {
    /*
     * 왜 안 되는지를 말해 준다. 반려된 건을 지우려 한 경우가 특히 그렇다 —
     * "처리가 시작됐다"고만 하면 반려는 처리가 아닌데 왜 막히나 싶다.
     */
    const reason =
      intent === 'withdraw'
        ? complaint.status === 'withdrawn'
          ? '이미 철회된 민원입니다.'
          : '보완 요청을 받은 민원만 철회할 수 있습니다.'
        : complaint.status === 'withdrawn'
          ? '철회된 민원은 고치거나 지울 수 없습니다.'
          : intent === 'delete' && complaint.status === 'returned'
            ? '보완 요청을 받은 민원은 지울 수 없습니다. 고쳐서 다시 보내거나 철회하세요.'
            : `이미 처리가 시작된 민원은 ${intent === 'edit' ? '고칠' : '지울'} 수 없습니다.`;
    return NextResponse.json({ error: reason }, { status: 409 });
  }
  return null;
}

/** 이 사용자의 소속. 토큰에 없으므로 그때그때 읽는다(소속을 옮기면 곧바로 반영돼야 한다). */
async function departmentOf(userId: number): Promise<string | null> {
  const { data } = await supabase.from('users').select('department').eq('id', userId).single();
  return data?.department ?? null;
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!verifyCsrfToken(request)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }

    const { id } = await context.params;
    const complaintId = Number(id);
    if (!Number.isInteger(complaintId) || complaintId <= 0) {
      return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
    }

    const body = await request.json();
    const action = String(body.action ?? '') as Action;

    const { data: complaint, error: loadError } = await supabase
      .from('complaints')
      .select(GUARD_COLUMNS)
      .eq('id', complaintId)
      .maybeSingle();

    if (loadError) {
      console.error('Complaint load error:', loadError);
      return NextResponse.json({ error: '민원을 불러올 수 없습니다.' }, { status: 500 });
    }
    if (!complaint) {
      return NextResponse.json({ error: '없는 민원입니다.' }, { status: 404 });
    }

    const now = new Date().toISOString();
    const isAdmin = canViewAllComplaints(user.role);

    /**
     * 이 건이 내 소속 것인가. 관리자급은 전체를, 지사는 자기 소속 것만 만진다.
     */
    const ownsThis = async (): Promise<boolean> => {
      if (isAdmin) return true;
      const department = await departmentOf(user.id);
      return !!department && department === complaint.assigned_group;
    };

    /** 끝났거나 닫힌 건. 어떤 동작도 받지 않는다 — 왜 안 되는지를 말해 준다. */
    const closedReason =
      complaint.status === 'done'
        ? '이미 처리 완료된 민원입니다.'
        : complaint.status === 'withdrawn'
          ? '철회된 민원입니다.'
          : null;

    /* ── 담당 지사 지정 · 옮기기 ───────────────────────────────── */
    if (action === 'assign_dept') {
      if (!canResolveUnassignedComplaints(user.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      /*
       * 못 찾은 건(unassigned)뿐 아니라 이미 지사에 간 건(branch)도 옮길 수 있다.
       * 한때 못 찾은 건만 됐는데, 그러면 잘못 간 민원을 관리자가 바로잡을 길이
       * 없었다 — 지사가 "우리 고객 아니다"라고 해도 옮겨 줄 수가 없었다.
       */
      if (!isOpenComplaint(complaint.status)) {
        return NextResponse.json(
          { error: closedReason ?? '진행 중인 민원만 지사를 정할 수 있습니다.' },
          { status: 400 }
        );
      }

      const group = String(body.group ?? '').trim();
      if (!group) {
        return NextResponse.json({ error: '지사를 골라 주세요.' }, { status: 400 });
      }
      /*
       * 화면에 없는 값이 요청으로 직접 올 수 있다. '관리자'·'담당자' 같은
       * 역할 전용 소속으로 넘기면 그 민원은 아무 지사에도 안 보이게 된다.
       */
      if (!isAssignableGroup(group)) {
        return NextResponse.json({ error: '지정할 수 없는 소속입니다.' }, { status: 400 });
      }
      const { data: exists } = await supabase
        .from('departments')
        .select('group_name')
        .eq('group_name', group)
        .limit(1);
      if (!exists || exists.length === 0) {
        return NextResponse.json({ error: '없는 소속입니다.' }, { status: 400 });
      }

      if (complaint.status === 'branch' && complaint.assigned_group === group) {
        return NextResponse.json({ error: '이미 그 지사에 가 있는 민원입니다.' }, { status: 400 });
      }

      /*
       * 어디서 어디로 옮겼는지 남긴다. 민원 행에는 지금 지사 하나만 남아
       * 옮기는 순간 앞의 지사가 덮이므로, 여기 안 적으면 사라진다.
       */
      await recordTransfer(supabase, {
        complaintId,
        kind: complaint.assigned_group ? 'move' : 'assign',
        from: complaint.assigned_group,
        to: group,
        reason: String(body.reason ?? '').trim() || null,
        byId: user.id,
        byName: user.username,
        at: now,
      });

      return await applyUpdate(complaintId, {
        assigned_group: group,
        assign_type: 'manual',
        assigned_by: user.username,
        assigned_at: now,
        status: 'branch',
        // 새 지사는 아직 안 봤다. 앞 지사의 확인 도장을 물려주면 새 지사의 미확인이 안 뜬다.
        read_at: null,
        read_by_id: null,
        read_by: null,
        updated_at: now,
      });
    }

    /* ── 지사가 관리자에게 되돌리기: "우리 지사 건이 아닙니다" ────── */
    if (action === 'bounce') {
      if (!canHandleComplaint(user.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (!(await ownsThis())) {
        return NextResponse.json({ error: '내 민원이 아닙니다.' }, { status: 403 });
      }
      if (complaint.status !== 'branch' || !complaint.assigned_group) {
        return NextResponse.json(
          { error: closedReason ?? '지사에 와 있는 민원만 되돌릴 수 있습니다.' },
          { status: 400 }
        );
      }
      const reason = String(body.reason ?? '').trim();
      // 사유 없이 돌아오면 관리자는 어디로 보내야 할지 모른다.
      if (!reason) {
        return NextResponse.json({ error: '왜 우리 지사 건이 아닌지 적어 주세요.' }, { status: 400 });
      }
      if (reason.length > 500) {
        return NextResponse.json({ error: '사유가 너무 깁니다.' }, { status: 400 });
      }

      // 이력을 먼저 남긴다. 아래에서 지사 칸을 비우면 어느 지사를 거쳤는지 사라진다.
      await recordTransfer(supabase, {
        complaintId,
        kind: 'bounce',
        from: complaint.assigned_group,
        to: null,
        reason,
        byId: user.id,
        byName: user.username,
        at: now,
      });

      /*
       * 관리자 앞으로 돌아간다. 배정 근거(찾은 방법·근거 파일)는 지운다 —
       * 그 근거가 틀렸다는 게 지금 이 건의 뜻이다. 확인 도장도 비운다.
       * 넣은 사람의 수정도 다시 열린다(unassigned는 아무도 안 손댄 상태로 본다).
       */
      return await applyUpdate(complaintId, {
        status: 'unassigned',
        assigned_group: null,
        assign_type: null,
        assigned_by: null,
        assigned_at: null,
        match_key: null,
        source_file_id: null,
        source_file_name: null,
        previous_applied_at: null,
        previous_assigned_at: null,
        read_at: null,
        read_by_id: null,
        read_by: null,
        updated_at: now,
      });
    }

    /* ── 민원담당자에게 보완 요청 ─────────────────────────────── */
    if (action === 'return') {
      if (!canResolveUnassignedComplaints(user.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      /*
       * 진행 중인 건만. 처리 완료·철회에 보완을 걸면 끝난 건이 되살아나고,
       * 이미 보완 중인 건에 또 걸면 이력만 두 줄 쌓인다.
       */
      if (!isOpenComplaint(complaint.status)) {
        return NextResponse.json(
          {
            error:
              closedReason ??
              (complaint.status === 'returned'
                ? '이미 보완 요청 중인 민원입니다.'
                : '진행 중인 민원만 보완 요청할 수 있습니다.'),
          },
          { status: 400 }
        );
      }
      const reason = String(body.reason ?? '').trim();
      // 사유 없는 보완 요청은 받은 사람이 무엇을 고쳐야 할지 모른다.
      if (!reason) {
        return NextResponse.json({ error: '보완 사유를 적어 주세요.' }, { status: 400 });
      }
      if (reason.length > 500) {
        return NextResponse.json({ error: '보완 사유가 너무 깁니다.' }, { status: 400 });
      }

      /*
       * 이력을 먼저 쌓는다.
       *
       * 민원 행의 return_* 칸은 '지금 반려 상태인가'만 나타낸다 — 등록자가
       * 고쳐서 다시 보내면 비워진다. 그때 사유까지 사라지면 몇 번 오갔는지
       * 아무도 모르게 되므로, 지워지지 않는 자리에 따로 남긴다.
       */
      const { error: historyError } = await supabase.from('complaint_returns').insert({
        complaint_id: complaintId,
        reason,
        returned_by_id: user.id,
        returned_by: user.username,
        returned_at: now,
      });
      if (historyError) {
        console.error('Complaint return history error:', historyError);
        return NextResponse.json({ error: '보완 기록을 남기지 못했습니다.' }, { status: 500 });
      }

      return await applyUpdate(complaintId, {
        status: 'returned',
        return_reason: reason,
        returned_by: user.username,
        returned_at: now,
        updated_at: now,
      });
    }

    /* ── 넣은 사람이 철회 ──────────────────────────────────────── */
    if (action === 'withdraw') {
      // 내 것인지·철회할 수 있는 상태인지를 한 자리에서 본다. 왜 안 되는지도 거기서 말한다.
      const denied = checkOwnEditable(complaint as any, user, 'withdraw');
      if (denied) return denied;
      const reason = String(body.reason ?? '').trim();
      if (reason.length > 500) {
        return NextResponse.json({ error: '철회 사유가 너무 깁니다.' }, { status: 400 });
      }
      /*
       * 지우지 않고 닫는다. 보완 이력(complaint_returns)도, 마지막 보완 사유도
       * 그대로 둔다 — "무엇을 왜 되돌렸고, 왜 안 하기로 했나"가 한 줄에 남는다.
       */
      return await applyUpdate(complaintId, {
        status: 'withdrawn',
        withdrawn_by: user.username,
        withdrawn_at: now,
        withdraw_reason: reason || null,
        updated_at: now,
      });
    }

    /* ── 확인 표시 ─────────────────────────────────────────────── */
    if (action === 'read') {
      if (!canHandleComplaint(user.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (!(await ownsThis())) {
        return NextResponse.json({ error: '내 민원이 아닙니다.' }, { status: 403 });
      }
      if (complaint.status !== 'branch') {
        return NextResponse.json(
          { error: closedReason ?? '지사에 와 있는 민원만 확인할 수 있습니다.' },
          { status: 400 }
        );
      }

      /*
       * 같은 건의 다른 회차도 함께 확인 처리한다. **아직 안 본 것만** 찍는다.
       *
       * 상세에 묶음 전체의 통화내역이 보이므로, 3차를 열어 본 사람은 1·2차도
       * 본 것이다. 다만 이미 본 회차의 시각과 사람은 덮지 않는다 — "처음 본
       * 사람이 누구였나"가 사라진다. 관리자가 보려는 건 첫 확인 시점이다.
       */
      const stamp = { read_at: now, read_by_id: user.id, read_by: user.username, updated_at: now };
      const alsoRead = await markUnreadInThread(complaint.thread_key, complaintId, stamp);

      /*
       * 이번 건은 이미 봤는데 뒤에 들어온 회차가 안 본 채 남아 있던 경우.
       * 위에서 그것들을 찍었으면 된 것이다. 찍을 것이 하나도 없었을 때만
       * "이미 확인"으로 답한다.
       */
      if (complaint.read_at) {
        if (alsoRead === 0) {
          return NextResponse.json({ error: '이미 확인한 민원입니다.' }, { status: 400 });
        }
        const { data } = await supabase
          .from('complaints')
          .select(COMPLAINT_COLUMNS)
          .eq('id', complaintId)
          .single();
        return NextResponse.json({ data, alsoRead });
      }

      return await applyUpdate(complaintId, stamp, { alsoRead });
    }

    /* ── 처리 내용 기록 ────────────────────────────────────────── */
    if (action === 'handle') {
      if (!canHandleComplaint(user.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (!(await ownsThis())) {
        return NextResponse.json({ error: '내 민원이 아닙니다.' }, { status: 403 });
      }
      /*
       * 지사에 와 있는 건만. 처리 완료를 다시 처리하면 처음 처리한 사람·시각이
       * 덮이고, 철회된 건을 처리하면 넣은 사람이 닫은 것이 되살아난다.
       */
      if (complaint.status !== 'branch') {
        return NextResponse.json(
          { error: closedReason ?? '지사에 넘어온 민원만 처리할 수 있습니다.' },
          { status: 400 }
        );
      }

      const note = String(body.note ?? '').trim();
      /*
       * 처리 내용 없이 완료로 바꾸면 올린 민원담당자는 결과를 알 수 없다.
       * 그러면 확인 도장만 남고 민원은 처리됐는지 알 수 없는 상태가 된다.
       */
      if (!note) {
        return NextResponse.json({ error: '처리 내용을 적어 주세요.' }, { status: 400 });
      }
      if (note.length > 2000) {
        return NextResponse.json({ error: '처리 내용이 너무 깁니다.' }, { status: 400 });
      }

      /*
       * 같은 건의 남은 회차도 함께 끝낸다.
       *
       * 한 번 전화해서 다 푸는 일이라, 한 건만 완료로 두면 나머지가 계속
       * 미처리로 떠 있다. 처리 내용은 같은 글을 그대로 남긴다 — 어느 회차를
       * 열어도 결론이 보여야 한다.
       */
      const alsoClosed = await applyToThread(complaint.thread_key, complaintId, {
        status: 'done',
        handled_note: note,
        handled_by: user.username,
        handled_at: now,
        read_at: now,
        read_by_id: user.id,
        read_by: user.username,
        updated_at: now,
      });

      return await applyUpdate(
        complaintId,
        {
          status: 'done',
          handled_note: note,
          handled_by: user.username,
          handled_at: now,
          // 처리했다면 본 것이다. 확인을 따로 누르지 않았어도 그렇게 남긴다.
          ...(complaint.read_at
            ? {}
            : { read_at: now, read_by_id: user.id, read_by: user.username }),
          updated_at: now,
        },
        // 이번 건까지 세어 넘긴다 — 화면은 "몇 건이 끝났나"만 알면 된다.
        { closed: alsoClosed + 1 }
      );
    }

    /* ── 넣은 사람이 고치기 ────────────────────────────────────── */
    if (action === 'update') {
      const denied = checkOwnEditable(complaint as any, user, 'edit');
      if (denied) return denied;

      const parsed = readComplaintInput(body);
      if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }

      /*
       * 배정도 다시 찾는다. 주문번호를 잘못 적어 '담당 지사 없음'이 된 건을
       * 고쳤는데 그대로 남으면, 고친 보람이 없고 관리자가 계속 들고 있게 된다.
       */
      /*
       * 반려 상태를 푼다.
       *
       * 고쳐서 다시 보낸 것이므로 지금은 반려가 아니다. 지나간 반려는
       * complaint_returns에 그대로 남아 있어 이력이 사라지지는 않는다.
       */
      /*
       * 주문번호나 전화번호를 고쳐 다른 묶음이 됐으면 회차도 그 묶음 기준으로
       * 다시 센다. 그대로 두면 '2차'였던 건이 새 묶음에서도 2차로 남는다.
       */
      const newThreadKey = complaintThreadKey(parsed.fields.orderNo, parsed.fields.phone);
      let sequence: Record<string, unknown> = {};
      if (newThreadKey !== complaint.thread_key) {
        const { count } = await supabase
          .from('complaints')
          .select('id', { count: 'exact', head: true })
          .eq('thread_key', newThreadKey);
        sequence = { sequence_no: (count ?? 0) + 1 };
      }

      const rebuilt = await toComplaintRow(supabase, parsed.fields);
      /*
       * 고치면 배정을 다시 찾는다. 그 결과 지사가 바뀌었으면 그것도 오간 것이다 —
       * 주문번호를 바로잡아 다른 지사로 간 것을 안 남기면 왜 옮겨졌는지 알 수 없다.
       */
      const nextGroup = (rebuilt.assigned_group as string | null) ?? null;
      if (nextGroup !== (complaint.assigned_group ?? null)) {
        await recordTransfer(supabase, {
          complaintId,
          kind: 'auto',
          from: complaint.assigned_group,
          to: nextGroup,
          reason: '넣은 사람이 내용을 고쳐 다시 찾음',
          byId: user.id,
          byName: user.username,
          at: now,
        });
      }

      return await applyUpdate(complaintId, {
        ...rebuilt,
        ...sequence,
        return_reason: null,
        returned_by: null,
        returned_at: null,
        updated_at: now,
      });
    }

    return NextResponse.json({ error: '알 수 없는 요청입니다.' }, { status: 400 });
  } catch (error) {
    console.error('Complaint update error:', error);
    return NextResponse.json({ error: '민원을 바꾸지 못했습니다.' }, { status: 500 });
  }
}

/**
 * 넣은 사람이 지우기.
 *
 * 잘못 넣은 건을 남겨 두면 지사가 없는 민원을 계속 들여다보게 된다. 다만
 * 누군가 손댄 뒤에는 지울 수 없다 — 처리 기록이 함께 사라지기 때문이다.
 */
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!verifyCsrfToken(request)) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }

    const { id } = await context.params;
    const complaintId = Number(id);
    if (!Number.isInteger(complaintId) || complaintId <= 0) {
      return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
    }

    const { data: complaint, error: loadError } = await supabase
      .from('complaints')
      .select(GUARD_COLUMNS)
      .eq('id', complaintId)
      .maybeSingle();

    if (loadError) {
      console.error('Complaint load error:', loadError);
      return NextResponse.json({ error: '민원을 불러올 수 없습니다.' }, { status: 500 });
    }
    if (!complaint) {
      return NextResponse.json({ error: '없는 민원입니다.' }, { status: 404 });
    }

    const denied = checkOwnEditable(complaint as any, user, 'delete');
    if (denied) return denied;

    /*
     * 관리자가 지울 때는 사유를 받아 보관본을 남긴다.
     *
     * 관리자는 처리가 끝난 건도, 남이 넣은 건도 지울 수 있다. 그냥 지우면
     * 민원과 함께 보완 이력·배정 이력까지 사라지고(둘 다 CASCADE) 그 건이
     * 있었다는 사실조차 남지 않는다. 지우는 것은 그대로 하되 무엇을 누가 왜
     * 지웠는지는 남긴다 — 파일 삭제(deleted_files)와 같은 방식이다.
     *
     * 넣은 사람이 아무도 안 본 건을 물릴 때는 사유를 묻지 않는다. 그건
     * 잘못 적은 것을 바로 지우는 일이라 남길 사정이 없다.
     */
    const isAdmin = canViewAllComplaints(user.role);
    if (isAdmin) {
      const body = await request.json().catch(() => ({}));
      const reason = String((body as any)?.reason ?? '').trim();
      if (!reason) {
        return NextResponse.json({ error: '삭제 사유를 적어 주세요.' }, { status: 400 });
      }
      if (reason.length > 500) {
        return NextResponse.json({ error: '삭제 사유가 너무 깁니다.' }, { status: 400 });
      }

      const { data: full } = await supabase
        .from('complaints')
        .select(COMPLAINT_COLUMNS)
        .eq('id', complaintId)
        .maybeSingle();
      const snapshot: any = full ?? complaint;

      const { error: archiveError } = await supabase.from('deleted_complaints').insert({
        complaint_id: complaintId,
        snapshot,
        returns: snapshot?.complaint_returns ?? [],
        transfers: snapshot?.complaint_transfers ?? [],
        reason,
        deleted_by_id: user.id,
        deleted_by: user.username,
      });
      /*
       * 보관에 실패하면 지우지 않는다. 여기서 그냥 넘어가면 되짚을 것 없이
       * 사라지는데, 그건 지운 사람도 나중에 답을 못 하는 상태다.
       */
      if (archiveError) {
        console.error('Complaint archive error:', archiveError);
        return NextResponse.json(
          { error: '삭제 기록을 남기지 못해 지우지 않았습니다.' },
          { status: 500 }
        );
      }
    }

    const { error } = await supabase.from('complaints').delete().eq('id', complaintId);
    if (error) {
      console.error('Complaint delete error:', error);
      return NextResponse.json({ error: '민원을 지우지 못했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Complaint delete error:', error);
    return NextResponse.json({ error: '민원을 지우지 못했습니다.' }, { status: 500 });
  }
}


/**
 * 같은 묶음의 아직 안 끝난 건들에도 같은 손질을 한다.
 *
 * 같은 주문·같은 고객의 민원은 한 번 전화해서 함께 푸는 것이 맞다. 그런데
 * 기록만 한 건에 남으면 나머지는 계속 미처리로 떠 있고, 지사는 이미 끝낸 일을
 * 다시 붙들게 된다. 확인도 마찬가지다 — 같은 건을 두 번 확인하라는 것은 뜻이
 * 없고, 하나만 찍히면 배지가 안 내려간다.
 *
 * 이미 끝난 건은 건드리지 않는다. 지난 처리 내용을 이번 것으로 덮으면
 * "그때 뭐라고 안내했나"가 사라진다.
 */
/** 같은 건에서 지사가 아직 안 본 회차에만 확인 도장을 찍는다. 찍힌 건수를 돌려준다. */
async function markUnreadInThread(
  threadKey: string | null,
  exceptId: number,
  stamp: Record<string, unknown>
): Promise<number> {
  if (!threadKey) return 0;
  const { data, error } = await supabase
    .from('complaints')
    .update(stamp)
    .eq('thread_key', threadKey)
    .neq('id', exceptId)
    .eq('status', 'branch')
    .is('read_at', null)
    .select('id');
  if (error) {
    console.error('Complaint thread read error:', error);
    return 0;
  }
  return data?.length ?? 0;
}

async function applyToThread(
  threadKey: string | null,
  exceptId: number,
  patch: Record<string, unknown>
): Promise<number> {
  if (!threadKey) return 0;
  const { data, error } = await supabase
    .from('complaints')
    .update(patch)
    .eq('thread_key', threadKey)
    .neq('id', exceptId)
    .eq('status', 'branch')
    .select('id');
  // 묶음까지 못 고쳐도 이번 건은 끝난 것이다. 남은 건은 다시 눌러 처리할 수 있다.
  if (error) {
    console.error('Complaint thread patch error:', error);
    return 0;
  }
  // 몇 건이 함께 끝났는지. 화면이 "3건이 함께 처리되었습니다"라고 말해 준다.
  return data?.length ?? 0;
}

async function applyUpdate(
  id: number,
  patch: Record<string, unknown>,
  /** 화면에 함께 알려 줄 값. 지금은 '몇 건이 함께 끝났는가'만 쓴다. */
  extra?: Record<string, unknown>
) {
  const { data, error } = await supabase
    .from('complaints')
    .update(patch)
    .eq('id', id)
    .select(COMPLAINT_COLUMNS)
    .single();

  if (error) {
    console.error('Complaint patch error:', error);
    return NextResponse.json({ error: '민원을 바꾸지 못했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ data, ...extra });
}
