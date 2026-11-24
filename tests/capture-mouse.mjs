/** Chooses "Capture mouse" on the pause page with the pointer at (x, y) and returns once the GAME plays with the
 * pointer captured. The browser sets document.pointerLockElement before it tells the page (pointerlockchange), and the
 * game takes a pointer movement as a look only after that event (ns-controls acceptPointerLock): a test that moved the
 * mouse in between had its move read as a free pointer's, and its wait for the look to turn timed out now and then. */
export async function captureMouse(page, x, y) {
  const capture = page.getByRole('button', {name: 'Capture mouse', exact: true});
  if (!await capture.isVisible()) {
    await page.locator('#ns-canvas').focus();
    await page.keyboard.press('Escape');
  }
  await capture.waitFor();
  await page.mouse.move(x, y);
  await capture.press('Enter');
  await page.waitForFunction(() => {
    if (document.pointerLockElement?.id !== 'ns-canvas') return false;
    const shell = window.__nsQA?.inspect?.().shell;
    return !shell || (shell.locked === true && shell.mode === 'playing');
  });
}
