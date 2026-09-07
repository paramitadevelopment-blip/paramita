import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getUserFromRequest } from '@/lib/jwt';
import { canRequestGift, canViewAllGiftRequests } from '@/lib/roles';
import { findGiftSource, groupOfDepartment } from '@/lib/giftLookup';
import { prefillFromRecord } from '@/lib/gifts';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * 주문번호로 신청서를 미리 채운다.
 *
 * 설계사가 주문번호만 치면 배포 기록에서 고객명·전화번호·주소·상품명을 찾아
 * 돌려준다. 화면은 이걸로 칸을 채워 보여주고, 설계사는 나머지만 적는다.
 *
 * 여기서 돌려준 값 중 고객명·전화번호는 **저장할 때 서버가 다시 찾아 넣는다.**
 * 이 응답은 보여주기 위한 것이고, 저장은 이 응답을 믿지 않는다.
 */
export async function GET(request: NextRequest) {
  try {
    const user = getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!canRequestGift(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const orderNo = (new URL(request.url).searchParams.get('orderNo') || '').trim();
    if (!orderNo) {
      return NextResponse.json({ error: '주문번호를 입력해 주세요.' }, { status: 400 });
    }

    const source = await findGiftSource(supabase, orderNo);
    if (!source) {
      return NextResponse.json(
        { error: '배포 기록에 없는 주문번호입니다. 우리가 배포한 고객만 신청할 수 있습니다.' },
        { status: 404 }
      );
    }

    const customerGroup = await groupOfDepartment(supabase, source.assignedDept);

    let groupName = customerGroup ?? '';
    if (!canViewAllGiftRequests(user.role)) {
      const { data: me } = await supabase
        .from('users')
        .select('department')
        .eq('id', user.id)
        .single();
      const department = me?.department ?? null;
      if (!department) {
        return NextResponse.json({ error: '소속을 확인할 수 없습니다.' }, { status: 403 });
      }
      /*
       * 남의 지사 고객이면 여기서 막는다. 저장할 때도 다시 막지만, 여덟 칸을
       * 다 채운 뒤에 "안 됩니다"를 듣는 것보다 번호를 친 순간 아는 편이 낫다.
       */
      if (customerGroup !== department) {
        return NextResponse.json(
          { error: `이 고객은 ${customerGroup ?? '다른'} 지사로 배정된 고객입니다. 우리 지사 고객만 신청할 수 있습니다.` },
          { status: 403 }
        );
      }
      groupName = department;
    }

    const prefill = prefillFromRecord(
      source.row,
      { id: source.fileId, name: source.fileName },
      { name: user.name, groupName }
    );
    return NextResponse.json({ data: prefill });
  } catch (error) {
    console.error('Gift lookup error:', error);
    return NextResponse.json({ error: '고객을 찾지 못했습니다.' }, { status: 500 });
  }
}
