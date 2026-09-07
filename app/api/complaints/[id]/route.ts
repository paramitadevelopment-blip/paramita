import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserFromRequest } from '@/lib/jwt';
import { verifyCsrfToken } from '@/lib/csrf';
import {
  canAssignComplaintAgent,
  canResolveUnassignedComplaints,
  canHandleComplaint,
  canRegisterComplaints,
  canViewAllComplaints,
  isAgentRole,
} from '@/lib/roles';
import { isAssignableGroup } from '@/lib/departments';
import {
  COMPLAINT_COLUMNS,
  canDeleteComplaint,
  canEditComplaint,
  type ComplaintLockInput,
} from '@/lib/complaints';
import { readComplaintInput, toComplaintRow } from '@/lib/complaintIntake';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * 민원 한 건을 다음 자리로 넘긴다.
 *
 * 네 가지 동작이 한 곳에 있다 — 전부 "이 건을 만질 수 있는 사람인가"를 같은
 * 방식으로 물어야 하기 때문이다. 라우트를 넷으로 쪼개면 그 검사도 넷이 되고,
 * 하나만 느슨해도 남의 지사 민원을 만질 수 있게 된다.
 *
 *   assign_dept   담당 지사를 못 찾은 건에 관리자가 지사를 지정한다
 *   return        관리자가 민원담당자에게 사유와 함께 되돌린다
 *   assign_agent  지사가 소속 설계사를 고른다
 *   read          지사·설계사가 봤다고 표시한다
 *   handle        처리 내용을 적고 완료로 바꾼다
 *   update        넣은 사람이 잘못 적은 것을 고친다
 *
 * 삭제(DELETE)도 여기 있다 — 고치기와 지우기는 "아직 아무도 손대지 않았는가"를
 * 같은 기준으로 물어야 한다.
 */

type Action = 'assign_dept' | 'return' | 'assign_agent' | 'handle' | 'read' | 'update';

/** 목록·상세를 만질 때 함께 봐야 하는 값. 무엇을 물어야 하는지가 여기 다 있다. */
const GUARD_COLUMNS =
  'id, status, assigned_group, assign_type, agent_id, handled_at, read_at, created_by_id, thread_key';

/**
 * 넣은 사람이 고치거나 지울 수 있는 건인가.
 *
 * 두 가지를 함께 본다 — 내 건인가(관리자는 전체), 그리고 아무도 손대지
 * 않았는가. 화면에서도 같은 기준으로 버튼을 감추지만, 요청은 직접 만들 수 있다.
 */
function checkOwnEditable(
  complaint: ComplaintLockInput & { created_by_id: number | null },
  user: { id: number; role: string },
  intent: 'edit' | 'delete'
): NextResponse | null {
  if (!canRegisterComplaints(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!canViewAllComplaints(user.role) && Number(complaint.created_by_id) !== user.id) {
    return NextResponse.json({ error: '내가 넣은 민원이 아닙니다.' }, { status: 403 });
  }

  const allowed = intent === 'edit' ? canEditComplaint(complaint) : canDeleteComplaint(complaint);
  if (!allowed) {
    /*
     * 왜 안 되는지를 말해 준다. 반려된 건을 지우려 한 경우가 특히 그렇다 —
     * "처리가 시작됐다"고만 하면 반려는 처리가 아닌데 왜 막히나 싶다.
     */
    const reason =
      intent === 'delete' && complaint.status === 'returned'
        ? '반려된 민원은 지울 수 없습니다. 내용을 고쳐서 다시 보내세요.'
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
     * 이 건이 내 소속 것인가.
     *
     * 관리자급은 전체를 만진다. 그 외에는 소속이 같아야 하고, 설계사는 소속이
     * 같아도 자기에게 넘어온 건이어야 한다.
     */
    const ownsThis = async (): Promise<boolean> => {
      if (isAdmin) return true;
      if (isAgentRole(user.role)) return Number(complaint.agent_id) === user.id;
      const department = await departmentOf(user.id);
      return !!department && department === complaint.assigned_group;
    };

    /* ── 담당 지사 지정 ────────────────────────────────────────── */
    if (action === 'assign_dept') {
      if (!canResolveUnassignedComplaints(user.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (complaint.status !== 'unassigned') {
        return NextResponse.json(
          { error: '담당 지사를 못 찾은 건만 지정할 수 있습니다.' },
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

      return await applyUpdate(complaintId, {
        assigned_group: group,
        assign_type: 'manual',
        assigned_by: user.username,
        assigned_at: now,
        status: 'branch',
        updated_at: now,
      });
    }

    /* ── 민원담당자에게 반려 ───────────────────────────────────── */
    if (action === 'return') {
      if (!canResolveUnassignedComplaints(user.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      const reason = String(body.reason ?? '').trim();
      // 사유 없는 반려는 받은 사람이 무엇을 고쳐야 할지 모른다.
      if (!reason) {
        return NextResponse.json({ error: '반려 사유를 적어 주세요.' }, { status: 400 });
      }
      if (reason.length > 500) {
        return NextResponse.json({ error: '반려 사유가 너무 깁니다.' }, { status: 400 });
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
        return NextResponse.json({ error: '반려 기록을 남기지 못했습니다.' }, { status: 500 });
      }

      return await applyUpdate(complaintId, {
        status: 'returned',
        return_reason: reason,
        returned_by: user.username,
        returned_at: now,
        updated_at: now,
      });
    }

    /* ── 소속 설계사 지정 ──────────────────────────────────────── */
    if (action === 'assign_agent') {
      if (!canAssignComplaintAgent(user.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (!(await ownsThis())) {
        return NextResponse.json({ error: '다른 지사의 민원입니다.' }, { status: 403 });
      }
      if (complaint.status !== 'branch' && complaint.status !== 'agent') {
        return NextResponse.json(
          { error: '지사에 넘어온 민원만 설계사를 지정할 수 있습니다.' },
          { status: 400 }
        );
      }

      const agentId = Number(body.agentId);
      if (!Number.isInteger(agentId) || agentId <= 0) {
        return NextResponse.json({ error: '설계사를 골라 주세요.' }, { status: 400 });
      }

      const { data: agent } = await supabase
        .from('users')
        .select('id, name, username, role, department')
        .eq('id', agentId)
        .maybeSingle();

      /*
       * 설계사인지, 그리고 이 민원을 받은 지사 소속인지 서버에서 다시 본다.
       * 화면은 자기 소속 설계사만 보여주지만, 요청은 직접 만들 수 있다.
       */
      if (!agent || agent.role !== 'agent') {
        return NextResponse.json({ error: '설계사 계정이 아닙니다.' }, { status: 400 });
      }
      if (agent.department !== complaint.assigned_group) {
        return NextResponse.json({ error: '다른 지사의 설계사입니다.' }, { status: 400 });
      }

      return await applyUpdate(complaintId, {
        agent_id: agent.id,
        agent_name: agent.name || agent.username,
        agent_assign_type: 'manual',
        agent_assigned_by: user.username,
        agent_assigned_at: now,
        status: 'agent',
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

      /*
       * 이미 본 건은 그대로 둔다.
       *
       * 다시 눌렀다고 시각과 사람을 덮어쓰면 "처음 본 사람이 누구였나"가
       * 사라진다. 관리자가 보려는 건 첫 확인 시점이다.
       */
      if (complaint.read_at) {
        return NextResponse.json({ error: '이미 확인한 민원입니다.' }, { status: 400 });
      }

      // 같은 건의 다른 회차도 함께 확인 처리한다. 아직 안 본 것만 찍힌다.
      await applyToThread(complaint.thread_key, complaintId, {
        read_at: now,
        read_by_id: user.id,
        read_by: user.username,
        updated_at: now,
      });

      return await applyUpdate(complaintId, {
        read_at: now,
        read_by_id: user.id,
        read_by: user.username,
        updated_at: now,
      });
    }

    /* ── 처리 내용 기록 ────────────────────────────────────────── */
    if (action === 'handle') {
      if (!canHandleComplaint(user.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (!(await ownsThis())) {
        return NextResponse.json({ error: '내 민원이 아닙니다.' }, { status: 403 });
      }
      if (complaint.status === 'unassigned' || complaint.status === 'returned') {
        return NextResponse.json(
          { error: '지사에 넘어온 민원만 처리할 수 있습니다.' },
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
      return await applyUpdate(complaintId, {
        ...(await toComplaintRow(supabase, parsed.fields)),
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
    .in('status', ['branch', 'agent'])
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
