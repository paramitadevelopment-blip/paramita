import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:3000';
const EXCEL = 'C:\\Users\\user\\Desktop\\20260816동양생명.xlsx';

test('업로드 → 분류 → 배포 → 다운로드', async ({ page }) => {
  test.setTimeout(180_000);

  // 1) 관리자 로그인
  await page.goto(`${BASE}/login`);
  await page.locator('input').first().fill('admin');
  await page.locator('input[type="password"]').fill('1234');
  await page.getByRole('button', { name: /로그인/ }).click();
  await page.waitForURL(/dashboard/, { timeout: 30_000 });
  await page.screenshot({ path: 'shot-1-login.png', fullPage: true });

  // 2) 파일 업로드 화면
  await page.goto(`${BASE}/dashboard/files`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'shot-2-files.png', fullPage: true });

  // 3) 엑셀 선택
  await page.locator('input[type="file"]').first().setInputFiles(EXCEL);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'shot-3-selected.png', fullPage: true });

  // 4) 분류 실행
  const startBtn = page.getByRole('button', { name: /분류|배포|시작/ }).first();
  await startBtn.click();

  // 분류 결과 모달이 뜰 때까지
  await page.waitForTimeout(8000);
  await page.screenshot({ path: 'shot-4-classified.png', fullPage: true });

  // 5) 배포하기
  const deployBtn = page.getByRole('button', { name: /배포하기/ });
  if (await deployBtn.count()) {
    await deployBtn.first().click();
    await page.waitForTimeout(10000);
  }
  await page.screenshot({ path: 'shot-5-deployed.png', fullPage: true });

  // 6) 파일 목록 확인
  await page.goto(`${BASE}/dashboard/download`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'shot-6-filelist.png', fullPage: true });
});
