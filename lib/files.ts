import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export interface DepartmentCheckResult {
  success: boolean;
  error?: string;
}

/**
 * Verify that a non-admin user can access a file based on department matching.
 * Returns error string if user cannot access, undefined if allowed.
 * Note: admins should be verified by the caller before calling this function.
 */
export async function checkUserFileDepartmentMatch(
  userId: number,
  fileId: string
): Promise<DepartmentCheckResult> {
  // 1. Get user's department
  const { data: userDept } = await supabase
    .from('users')
    .select('department')
    .eq('id', userId)
    .single();

  if (!userDept?.department) {
    return { success: false, error: 'Forbidden: no_user_dept' };
  }

  // 2. Get file's department via file.department_id
  const { data: file } = await supabase
    .from('files')
    .select('id, department_id')
    .eq('id', fileId)
    .single();

  if (!file) {
    return { success: false, error: 'File not found' };
  }

  // 3. Get department name from department_id
  const { data: fileDept } = await supabase
    .from('departments')
    .select('group_name')
    .eq('id', file.department_id)
    .single();

  if (!fileDept) {
    return { success: false, error: 'Forbidden: no_file_dept' };
  }

  // 4. Compare departments
  // 사용자 소속은 조직 단위('파라인슈')이고 파일 소속은 배정 분류('파라인슈1')라
  // 이름을 그대로 비교하면 어긋난다. 분류가 속한 그룹끼리 견준다.
  // 1:1인 소속은 group_name이 곧 name이라 동작이 전과 같다.
  if (fileDept.group_name !== userDept.department) {
    return { success: false, error: 'Forbidden: dept_mismatch' };
  }

  return { success: true };
}
