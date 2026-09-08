export interface UserRow {
  id: number;
  username: string;
  name: string;
  department: string;
  role: 'admin' | 'subadmin' | 'user' | 'staff' | 'agent' | 'complaint' | 'gift';
  employee_id?: string;
  /** 계정별 추가 권한. 역할 위에 얹힌다. */
  extra_permissions?: string[];
  created_at: string;
}

export interface UserForm {
  id?: number;
  username: string;
  name: string;
  password?: string;
  department: string;
  role: 'admin' | 'subadmin' | 'user' | 'staff' | 'agent' | 'complaint' | 'gift';
  employee_id?: string;
  extra_permissions?: string[];
}

