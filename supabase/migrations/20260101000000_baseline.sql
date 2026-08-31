-- 운영 DB(zjgzlcgrxprerczpdohq)의 스키마를 그대로 뜬 출발점.
--
-- 여기까지는 대시보드에서 직접 만든 것과 마이그레이션으로 만든 것이 섞여 있어
-- 파일만으로는 스키마를 재현할 수 없었다. 개발 DB를 따로 두려면 재현이 되어야 해서,
-- 이 시점의 운영 구조를 한 장으로 정리했다. 앞으로 바뀌는 것은 이 위에 쌓는다.
--
-- 데이터는 담지 않는다. 구조만이다.

-- ── 사람과 소속 ──────────────────────────────────────────

CREATE TABLE public.users (
  id BIGSERIAL PRIMARY KEY,
  username character varying NOT NULL,
  password_hash character varying NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  role character varying DEFAULT 'user'::character varying,
  department character varying(255),
  name character varying(255),
  employee_id text,
  CONSTRAINT users_username_key UNIQUE (username),
  CONSTRAINT users_employee_id_key UNIQUE (employee_id)
);

CREATE TABLE public.departments (
  id BIGSERIAL PRIMARY KEY,
  name character varying(255) NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  group_name text NOT NULL,
  is_admin boolean DEFAULT false NOT NULL,
  CONSTRAINT departments_name_key UNIQUE (name)
);

CREATE INDEX idx_departments_group_name ON public.departments USING btree (group_name);
-- 관리자 소속은 하나뿐이다. 여럿이면 어느 쪽이 관리자인지 정할 수 없다.
CREATE UNIQUE INDEX idx_departments_single_admin ON public.departments USING btree (is_admin) WHERE is_admin;

CREATE TABLE public.department_change_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  from_department character varying,
  to_department character varying,
  reason character varying NOT NULL,
  changed_by character varying,
  changed_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX idx_department_change_logs_user ON public.department_change_logs USING btree (user_id, changed_at DESC);

-- ── 파일 ─────────────────────────────────────────────────

CREATE TABLE public.files (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  size bigint NOT NULL,
  mime_type text DEFAULT 'application/octet-stream'::text NOT NULL,
  storage_path text NOT NULL,
  -- 올린 사람이 지워져도 파일은 남아야 한다. 파일은 업무 기록이다.
  uploaded_by bigint REFERENCES public.users(id) ON DELETE SET NULL,
  uploaded_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  download_count integer DEFAULT 0,
  department_id integer REFERENCES public.departments(id),
  is_original boolean DEFAULT false,
  original_file_id uuid REFERENCES public.files(id),
  file_content jsonb DEFAULT '[]'::jsonb,
  insurer_type character varying(2),
  CONSTRAINT files_storage_path_key UNIQUE (storage_path),
  -- varchar 끼리 비교하도록 쓴다. ::text 캐스팅은 Postgres 가 알아서 붙인다.
  -- 캐스팅을 직접 써 넣으면 저장되는 모양이 달라져 운영과 대조할 때 어긋난다.
  CONSTRAINT files_insurer_type_check CHECK (
    insurer_type = ANY (ARRAY['hk'::character varying, 'dy'::character varying, NULL::character varying])
  )
);

CREATE INDEX idx_files_created_at ON public.files USING btree (created_at DESC);
CREATE INDEX idx_files_storage_path ON public.files USING btree (storage_path);
CREATE INDEX idx_files_uploaded_by ON public.files USING btree (uploaded_by);

CREATE TABLE public.file_distributions (
  id BIGSERIAL PRIMARY KEY,
  file_id uuid NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,
  department_id bigint NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  classified_count bigint DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT file_distributions_file_id_department_id_key UNIQUE (file_id, department_id)
);

CREATE INDEX idx_file_distributions_department_id ON public.file_distributions USING btree (department_id);
CREATE INDEX idx_file_distributions_file_id ON public.file_distributions USING btree (file_id);

-- ── 파일 삭제 이력 ───────────────────────────────────────

CREATE TABLE public.file_deletion_events (
  id BIGSERIAL PRIMARY KEY,
  deleted_at timestamp with time zone DEFAULT now() NOT NULL,
  deleted_by character varying NOT NULL,
  total_count integer NOT NULL,
  restored_at timestamp with time zone,
  restored_by character varying,
  reason text NOT NULL,
  CONSTRAINT file_deletion_events_reason_length CHECK (
    ((char_length(btrim(reason)) >= 1) AND (char_length(btrim(reason)) <= 500))
  )
);

CREATE INDEX idx_file_deletion_events_deleted_at ON public.file_deletion_events USING btree (deleted_at DESC);

-- 지운 파일의 내용까지 들고 있다. 되돌리려면 구조가 아니라 내용이 있어야 한다.
CREATE TABLE public.deleted_files (
  id uuid PRIMARY KEY,
  name character varying NOT NULL,
  size bigint,
  storage_path character varying,
  department_id bigint,
  is_original boolean,
  original_file_id character varying,
  mime_type character varying,
  deletion_event_id bigint NOT NULL REFERENCES public.file_deletion_events(id) ON DELETE CASCADE,
  uploaded_by bigint,
  uploaded_at timestamp with time zone NOT NULL,
  restored_at timestamp with time zone,
  file_content jsonb DEFAULT '[]'::jsonb
);

CREATE INDEX deleted_files_event_restored_idx ON public.deleted_files USING btree (deletion_event_id, restored_at);
CREATE INDEX idx_deleted_files_event_id ON public.deleted_files USING btree (deletion_event_id);

-- 원본을 지울 때 끊어진 배포본 연결. 되돌릴 때 다시 이어 붙이는 근거다.
CREATE TABLE public.severed_file_links (
  id BIGSERIAL PRIMARY KEY,
  deletion_event_id bigint NOT NULL REFERENCES public.file_deletion_events(id) ON DELETE CASCADE,
  file_id uuid NOT NULL,
  original_file_id uuid NOT NULL,
  restored_at timestamp with time zone
);

CREATE INDEX severed_file_links_event_idx ON public.severed_file_links USING btree (deletion_event_id, restored_at);

-- ── 다운로드 ─────────────────────────────────────────────

CREATE TABLE public.download_records (
  id BIGSERIAL PRIMARY KEY,
  file_id text NOT NULL,
  file_name text NOT NULL,
  downloaded_by text NOT NULL,
  user_department text,
  downloaded_at timestamp with time zone DEFAULT now(),
  user_name text,
  user_employee_id text,
  file_content jsonb DEFAULT '[]'::jsonb,
  -- 계정을 지워도 받은 기록은 남는다. 개인정보가 나간 사실이라 지우면 안 된다.
  user_id bigint REFERENCES public.users(id) ON DELETE SET NULL,
  attempt_no integer,
  ip_address text,
  device_type text,
  os_name text,
  browser_name text
);

CREATE INDEX idx_download_records_device_type ON public.download_records USING btree (device_type);
CREATE INDEX idx_download_records_downloaded_at ON public.download_records USING btree (downloaded_at DESC);
CREATE INDEX idx_download_records_downloaded_by ON public.download_records USING btree (downloaded_by);
CREATE INDEX idx_download_records_ip_address ON public.download_records USING btree (ip_address);
CREATE INDEX idx_download_records_user_file ON public.download_records USING btree (user_id, file_id);
-- 같은 차수를 두 번 받을 수 없다. 재다운로드 승인이 한 번에 한 번만 쓰이게 한다.
CREATE UNIQUE INDEX idx_download_records_user_file_attempt ON public.download_records USING btree (user_id, file_id, attempt_no)
  WHERE ((user_id IS NOT NULL) AND (attempt_no IS NOT NULL));

CREATE TABLE public.redownload_requests (
  id BIGSERIAL PRIMARY KEY,
  file_id uuid NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,
  user_id bigint REFERENCES public.users(id) ON DELETE SET NULL,
  file_name text NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  requested_at timestamp with time zone DEFAULT now() NOT NULL,
  reviewed_by bigint REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at timestamp with time zone,
  reason text,
  review_reason text,
  username text,
  user_name text,
  user_employee_id text,
  user_department text,
  reviewed_by_name text,
  CONSTRAINT redownload_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]))),
  CONSTRAINT redownload_requests_reason_length CHECK (
    ((reason IS NULL) OR ((char_length(btrim(reason)) >= 1) AND (char_length(btrim(reason)) <= 500)))
  ),
  CONSTRAINT redownload_requests_review_reason_length CHECK (
    ((review_reason IS NULL) OR ((char_length(btrim(review_reason)) >= 1) AND (char_length(btrim(review_reason)) <= 500)))
  )
);

CREATE INDEX idx_redownload_requests_file_user ON public.redownload_requests USING btree (file_id, user_id);
CREATE INDEX idx_redownload_requests_status ON public.redownload_requests USING btree (status);
CREATE INDEX idx_redownload_requests_user_department ON public.redownload_requests USING btree (user_department);
-- 같은 파일에 대기 중인 요청은 하나뿐이다. 여러 번 눌러 쌓이면 승인 화면이 어지럽다.
CREATE UNIQUE INDEX idx_redownload_requests_one_pending ON public.redownload_requests USING btree (file_id, user_id)
  WHERE (status = 'pending'::text);

-- ── 블랙리스트 ───────────────────────────────────────────

CREATE TABLE public.blacklist (
  id BIGSERIAL PRIMARY KEY,
  -- 비교용 정규화 값
  product_key text NOT NULL,
  birth_key text NOT NULL,
  phone_keys text[] NOT NULL,
  -- 표시용 원본 값
  customer_name text,
  product_name text NOT NULL,
  birth text,
  tel1 text,
  tel2 text,
  reason text NOT NULL,
  request_count integer NOT NULL,
  -- 파일을 지워도 명단은 남는다. 파일과 함께 사라지면 영구 차단이 아니다.
  source_file_id uuid REFERENCES public.files(id) ON DELETE SET NULL,
  source_file_name text,
  registered_at timestamp with time zone DEFAULT now() NOT NULL,
  released_at timestamp with time zone,
  release_reason text,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  registered_by text DEFAULT 'system'::text NOT NULL,
  CONSTRAINT blacklist_registered_by_check CHECK ((registered_by = ANY (ARRAY['system'::text, 'admin'::text])))
);

CREATE INDEX idx_blacklist_identity ON public.blacklist USING btree (product_key, birth_key);
CREATE INDEX idx_blacklist_phones ON public.blacklist USING gin (phone_keys);
CREATE INDEX idx_blacklist_active ON public.blacklist USING btree (released_at);
CREATE INDEX idx_blacklist_registered ON public.blacklist USING btree (registered_at DESC);
CREATE INDEX idx_blacklist_registered_by ON public.blacklist USING btree (registered_by);

CREATE TABLE public.blacklist_history (
  id BIGSERIAL PRIMARY KEY,
  blacklist_id bigint NOT NULL REFERENCES public.blacklist(id) ON DELETE CASCADE,
  action text NOT NULL,
  reason text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX idx_blacklist_history_blacklist_id ON public.blacklist_history USING btree (blacklist_id);
CREATE INDEX idx_blacklist_history_created_at ON public.blacklist_history USING btree (created_at DESC);

-- 명단에 오른 사람의 신청 건. 신청횟수도 출처 목록도 이 표에서 나온다.
CREATE TABLE public.blacklist_applications (
  id BIGSERIAL PRIMARY KEY,
  blacklist_id bigint NOT NULL REFERENCES public.blacklist(id) ON DELETE CASCADE,
  -- 주문번호는 파일 안에서만 유니크하다. 그래서 아래 UNIQUE가 파일까지 함께 본다.
  order_key text NOT NULL,
  customer_name text,
  product_name text,
  -- files 를 참조하지 않는다. 파일을 지우면 deleted_files 로 옮겨 가는데,
  -- 외래키가 있으면 그때 NULL이 되어 어느 파일이었는지 잃는다.
  source_file_id uuid,
  source_file_name text,
  applied_at timestamp with time zone,
  recorded_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT blacklist_applications_file_order_key
    UNIQUE NULLS NOT DISTINCT (blacklist_id, source_file_id, order_key)
);

CREATE INDEX idx_blacklist_applications_blacklist ON public.blacklist_applications USING btree (blacklist_id);
CREATE INDEX idx_blacklist_applications_file ON public.blacklist_applications USING btree (source_file_id);

-- ── 재신청 고객 알림 ─────────────────────────────────────

CREATE TABLE public.reapply_notices (
  id BIGSERIAL PRIMARY KEY,
  customer_name text,
  birth text,
  tel1 text,
  tel2 text,
  phone_keys text[] NOT NULL,
  product_name text,
  reason text NOT NULL,
  order_no text,
  source_file_id uuid REFERENCES public.files(id) ON DELETE SET NULL,
  source_file_name text,
  applied_at timestamp with time zone NOT NULL,
  assigned_dept text NOT NULL,
  assigned_group text NOT NULL,
  previous_applied_at timestamp with time zone,
  assigned_file_id uuid REFERENCES public.files(id) ON DELETE SET NULL,
  assigned_file_name text,
  read_at timestamp with time zone,
  read_by bigint,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- 지사는 자기 소속의 안 읽은 건을 먼저 본다. 사이드바 배지도 이 조회를 쓴다.
CREATE INDEX idx_reapply_group ON public.reapply_notices USING btree (assigned_group, read_at);
-- 사람이 하이픈을 넣거나 빼서 검색하므로 숫자만 담아 둔다.
CREATE INDEX idx_reapply_phones ON public.reapply_notices USING gin (phone_keys);

-- ── 로그인 기록 ──────────────────────────────────────────

CREATE TABLE public.login_records (
  id BIGSERIAL PRIMARY KEY,
  user_id bigint,
  username text NOT NULL,
  user_name text,
  user_department text,
  user_role text,
  success boolean NOT NULL,
  fail_reason text,
  ip_address text,
  device_type text,
  os_name text,
  browser_name text,
  logged_in_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX idx_login_time ON public.login_records USING btree (logged_in_at DESC);
CREATE INDEX idx_login_user ON public.login_records USING btree (user_id, logged_in_at DESC);
CREATE INDEX idx_login_failed ON public.login_records USING btree (success, logged_in_at DESC);

-- ── 함수 ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.increment_file_download_count(p_file_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  UPDATE files
  SET download_count = COALESCE(download_count, 0) + 1
  WHERE id = p_file_id;
$function$;

CREATE OR REPLACE FUNCTION public.delete_department_with_migration(p_dept_id bigint, p_new_dept_name character varying, p_actor character varying)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old_name varchar;
  v_old_group varchar;
  v_new_dept_id bigint;
  v_new_group varchar;
  v_siblings int := 0;
  v_user_count int := 0;
  v_file_count int := 0;
BEGIN
  SELECT name, group_name INTO v_old_name, v_old_group
  FROM departments WHERE id = p_dept_id;

  IF v_old_name IS NULL THEN
    RAISE EXCEPTION 'DEPARTMENT_NOT_FOUND';
  END IF;

  -- 같은 조직에 남는 다른 분류가 있는가
  SELECT count(*) INTO v_siblings
  FROM departments WHERE group_name = v_old_group AND id <> p_dept_id;

  -- 마지막 분류일 때만 그 조직 소속 사용자가 갈 곳을 잃는다.
  IF v_siblings = 0 THEN
    SELECT count(*) INTO v_user_count FROM users WHERE department = v_old_group;
  END IF;

  SELECT count(*) INTO v_file_count FROM files WHERE department_id = p_dept_id;

  IF v_user_count > 0 OR v_file_count > 0 THEN
    IF p_new_dept_name IS NULL OR btrim(p_new_dept_name) = '' THEN
      RAISE EXCEPTION 'NEW_DEPARTMENT_REQUIRED';
    END IF;

    SELECT id, group_name INTO v_new_dept_id, v_new_group
    FROM departments WHERE name = btrim(p_new_dept_name);

    IF v_new_dept_id IS NULL THEN
      RAISE EXCEPTION 'NEW_DEPARTMENT_NOT_FOUND';
    END IF;

    IF v_new_dept_id = p_dept_id THEN
      RAISE EXCEPTION 'SAME_DEPARTMENT';
    END IF;

    -- 사용자는 조직 단위로 옮긴다. 분류명을 넣으면 그 사용자는 어떤 그룹에도
    -- 걸리지 않아 파일이 안 보이게 된다.
    IF v_user_count > 0 THEN
      INSERT INTO department_change_logs (user_id, from_department, to_department, reason, changed_by)
      SELECT id, v_old_group, v_new_group, 'department_deleted', p_actor
      FROM users
      WHERE department = v_old_group;

      UPDATE users SET department = v_new_group WHERE department = v_old_group;
    END IF;

    UPDATE files SET department_id = v_new_dept_id WHERE department_id = p_dept_id;
  END IF;

  DELETE FROM departments WHERE id = p_dept_id;

  RETURN json_build_object(
    'migratedUsers', v_user_count,
    'migratedFiles', v_file_count
  );
END;
$function$;

-- ── RLS ──────────────────────────────────────────────────
--
-- 앱은 서버에서 service_role 키로 붙는다. service_role 은 RLS를 지나치므로
-- 정책이 없는 표도 앱에서는 읽고 쓸 수 있다. 정책이 없다는 건 "클라이언트가
-- 직접 붙어서는 아무것도 못 한다"는 뜻이고, 그게 이 표들에 맞는 상태다.

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.department_change_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_distributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_deletion_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deleted_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.severed_file_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.download_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.redownload_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blacklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blacklist_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blacklist_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reapply_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to view blacklist" ON public.blacklist
  FOR SELECT TO public USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "Allow authenticated users to insert blacklist" ON public.blacklist
  FOR INSERT TO public WITH CHECK ((auth.role() = 'authenticated'::text));
CREATE POLICY "Allow authenticated users to delete blacklist" ON public.blacklist
  FOR DELETE TO public USING ((auth.role() = 'authenticated'::text));

CREATE POLICY "Authenticated users can view" ON public.blacklist_history
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Only admin can insert" ON public.blacklist_history
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can view" ON public.blacklist_applications
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert" ON public.blacklist_applications
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update" ON public.blacklist_applications
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete" ON public.blacklist_applications
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "Allow admin to read all download records" ON public.download_records
  FOR SELECT TO public USING (((auth.jwt() ->> 'role'::text) = 'admin'::text));
CREATE POLICY "Allow users to read their own download records" ON public.download_records
  FOR SELECT TO public USING (((auth.jwt() ->> 'username'::text) = downloaded_by));

CREATE POLICY "Allow authenticated users to view file_distributions" ON public.file_distributions
  FOR SELECT TO public USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "Allow admin to insert file_distributions" ON public.file_distributions
  FOR INSERT TO public WITH CHECK ((auth.role() = 'authenticated'::text));
CREATE POLICY "Allow admin to update file_distributions" ON public.file_distributions
  FOR UPDATE TO public USING ((auth.role() = 'authenticated'::text));

CREATE POLICY "Authenticated users can view" ON public.login_records
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert" ON public.login_records
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can view" ON public.reapply_notices
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert" ON public.reapply_notices
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update" ON public.reapply_notices
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to view redownload_requests" ON public.redownload_requests
  FOR SELECT TO public USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "Allow authenticated users to insert redownload_requests" ON public.redownload_requests
  FOR INSERT TO public WITH CHECK ((auth.role() = 'authenticated'::text));
CREATE POLICY "Allow authenticated users to update redownload_requests" ON public.redownload_requests
  FOR UPDATE TO public USING ((auth.role() = 'authenticated'::text));
