export async function captureMouse(page, x, y) {
  const capture = page.getByRole('button', {name: 'Capture mouse', exact: true});
  if (!await capture.isVisible()) {
    await page.locator('#ns-canvas').focus();
    await page.keyboard.press('Escape');
  }
  await capture.waitFor();
  await page.mouse.move(x, y);
  await capture.press('Enter');
  await page.waitForFunction(() => document.pointerLockElement?.id === 'ns-canvas');
}
