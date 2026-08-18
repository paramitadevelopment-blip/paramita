export interface UserRow {
  id: number;
  username: string;
  name: string;
  department: string;
  role: 'admin' | 'user';
  employee_id?: string;
  created_at: string;
}

export interface UserForm {
  id?: number;
  username: string;
  name: string;
  password?: string;
  department: string;
  role: 'admin' | 'user';
  employee_id?: string;
}
