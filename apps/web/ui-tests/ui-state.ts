import { expect, type Page } from '@playwright/test';
import { UI_STATES } from './ui-matrix.mts';

export { UI_STATES };

export type UiState = (typeof UI_STATES)[number];

const scenarioByState: Partial<Record<UiState, string>> = {
  game: 'ability-turn',
  combat: 'multi-monster',
  reaction: 'reaction',
  'blocking-discard': 'discard',
  'full-hand': 'ability-turn',
};

async function gotoApplication(page: Page): Promise<void> {
  const response = await page.goto('/', { waitUntil: 'domcontentloaded' });
  if (response !== null && !response.ok()) {
    throw new Error(`Application navigation failed with HTTP ${response.status()}.`);
  }

  const waitForBootstrap = (): Promise<unknown> =>
    page.waitForFunction(() => (document.querySelector('app-root')?.childElementCount ?? 0) > 0, {
      timeout: 5_000,
    });

  try {
    await waitForBootstrap();
  } catch {
    // A reused development server can very rarely return a document before Angular
    // bootstraps. Retry only that blank-document condition, never a UI assertion.
    const isBlankBootstrap = await page.evaluate(
      () => (document.querySelector('app-root')?.childElementCount ?? 0) === 0,
    );
    if (!isBlankBootstrap) throw new Error('Application bootstrap did not become ready.');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForBootstrap();
  }
}

async function createLobby(page: Page): Promise<string> {
  await gotoApplication(page);
  const createButton = page.locator('.join-card .primary');
  await expect(createButton).toBeEnabled();
  await page.locator('#player-name').fill('UI Host');
  await createButton.click();
  const roomTitle = page.locator('#lobby-title');
  await expect(roomTitle).toBeVisible();
  return (await roomTitle.textContent())!.trim();
}

async function startGame(page: Page, roomCode: string): Promise<void> {
  await page.locator('.sex-picker button').first().click();
  const startButton = page.locator('.lobby-card > button.primary');
  await expect(startButton).toBeEnabled();
  await startButton.click();
  await expect(page.locator('.game-shell')).toBeVisible();

  const scenario = scenarioByState[pageState(page)];
  if (scenario === undefined) return;
  const response = await page.request.post(
    `http://127.0.0.1:3000/api/development/room/${roomCode}/scenario/${scenario}`,
  );
  expect(response.ok(), await response.text()).toBe(true);
  await page.reload();
  await expect(page.locator('.game-shell')).toBeVisible();
}

const pageStates = new WeakMap<Page, UiState>();

function pageState(page: Page): UiState {
  const state = pageStates.get(page);
  if (state === undefined) throw new Error('UI state was not assigned to the page.');
  return state;
}

export async function openUiState(page: Page, state: UiState): Promise<void> {
  pageStates.set(page, state);
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
  if (state === 'home') {
    await gotoApplication(page);
    await expect(page.locator('.join-card .primary')).toBeEnabled();
  } else {
    const roomCode = await createLobby(page);
    if (state !== 'lobby') await startGame(page, roomCode);
  }

  if (state === 'combat') await expect(page.locator('.encounter-tabs')).toBeVisible();
  if (state === 'reaction') await expect(page.locator('.reaction')).toBeVisible();
  if (state === 'blocking-discard') {
    await expect(page.locator('.decision-sheet')).toBeVisible();
  }
  if (state === 'full-hand') {
    await page.locator('.hand-menu').click();
    await expect(page.locator('.full-hand-sheet')).toBeVisible();
  }

  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-delay: 0s !important;
        animation-duration: 0s !important;
        caret-color: transparent !important;
        scroll-behavior: auto !important;
        transition-delay: 0s !important;
        transition-duration: 0s !important;
      }
    `,
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo(0, 0);
  });
}
