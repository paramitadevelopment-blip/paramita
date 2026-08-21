-- files.download_count를 원자적으로 1 올린다.
-- 애플리케이션에서 읽은 값에 +1을 써 넣으면 두 요청이 겹쳤을 때 한쪽 증가분이 사라진다.
-- UPDATE ... SET x = x + 1은 행 잠금 안에서 계산되므로 그런 유실이 없다.
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
