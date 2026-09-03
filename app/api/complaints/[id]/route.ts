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
import { COMPLAINT_COLUMNS, isUntouchedComplaint } from '@/lib/complaints';
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
 *   handle        처리 내용을 적고 완료로 바꾼다
 *   update        넣은 사람이 잘못 적은 것을 고친다
 *
 * 삭제(DELETE)도 여기 있다 — 고치기와 지우기는 "아직 아무도 손대지 않았는가"를
 * 같은 기준으로 물어야 한다.
 */

type Action = 'assign_dept' | 'return' | 'assign_agent' | 'handle' | 'update';

/** 목록·상세를 만질 때 함께 봐야 하는 값. 무엇을 물어야 하는지가 여기 다 있다. */
const GUARD_COLUMNS = 'id, status, assigned_group, assign_type, agent_id, handled_at, created_by_id';

/**
 * 넣은 사람이 고치거나 지울 수 있는 건인가.
 *
 * 두 가지를 함께 본다 — 내 건인가(관리자는 전체), 그리고 아무도 손대지
 * 않았는가. 화면에서도 같은 기준으로 버튼을 감추지만, 요청은 직접 만들 수 있다.
 */
function checkOwnEditable(
  complaint: { created_by_id: number | null; status: any; assign_type: any; agent_id: number | null; handled_at: string | null },
  user: { id: number; role: string }
): NextResponse | null {
  if (!canRegisterComplaints(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!canViewAllComplaints(user.role) && Number(complaint.created_by_id) !== user.id) {
    return NextResponse.json({ error: '내가 넣은 민원이 아닙니다.' }, { status: 403 });
  }
  if (!isUntouchedComplaint(complaint)) {
    return NextResponse.json(
      { error: '이미 처리가 시작된 민원은 고치거나 지울 수 없습니다.' },
      { status: 409 }
    );
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

      return await applyUpdate(complaintId, {
        status: 'done',
        handled_note: note,
        handled_by: user.username,
        handled_at: now,
        updated_at: now,
      });
    }

    /* ── 넣은 사람이 고치기 ────────────────────────────────────── */
    if (action === 'update') {
      const denied = checkOwnEditable(complaint as any, user);
      if (denied) return denied;

      const parsed = readComplaintInput(body);
      if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }

      /*
       * 배정도 다시 찾는다. 주문번호를 잘못 적어 '담당 지사 없음'이 된 건을
       * 고쳤는데 그대로 남으면, 고친 보람이 없고 관리자가 계속 들고 있게 된다.
       */
      return await applyUpdate(complaintId, {
        ...(await toComplaintRow(supabase, parsed.fields)),
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

    const denied = checkOwnEditable(complaint as any, user);
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

async function applyUpdate(id: number, patch: Record<string, unknown>) {
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

  return NextResponse.json({ data });
}
