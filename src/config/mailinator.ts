import { requiredUserCreationSetting, userCreationProfilePrefix, userCreationSetting } from './userCreation.js';
import childProcess from 'node:child_process';

export async function getMailinatorMessageLinks(userName: string, openBrowser = true): Promise<string> {
  const domain = 'vgnet.testinator.com';
  const profile = userCreationProfilePrefix(userCreationSetting('VG_ENVIRONMENT') ?? 'mdev');
  const loginPrefix = userCreationSetting(`${profile}LOGIN_PREFIX`);
  const username = userName.trim();
  const email = loginPrefix && username.startsWith(loginPrefix)
    ? username.slice(loginPrefix.length)
    : username;
  const parts = email.split('@');
  if (parts.length > 2 || (parts.length === 2 && parts[1].toLowerCase() !== domain)) {
    throw new Error(`Mailinator username must belong to ${domain}, or be an inbox name without a domain.`);
  }
  const inbox = parts[0];
  if (!/^[A-Za-z0-9_-]+$/.test(inbox)) {
    throw new Error('Mailinator username must contain a valid inbox name.');
  }
  const token = requiredUserCreationSetting('MAILINATOR_API_TOKEN');
  const inboxUrl = `https://api.mailinator.com/api/v2/domains/${domain}/inboxes/${encodeURIComponent(inbox)}`;
  const inboxResponse = await fetch(inboxUrl, {
    headers: { Authorization: token },
    signal: AbortSignal.timeout(30_000)
  });
  if (!inboxResponse.ok) {
    throw new Error(`Mailinator inbox request failed with HTTP ${inboxResponse.status}.`);
  }
  const body: unknown = await inboxResponse.json();
  if (!body || typeof body !== 'object' || !('msgs' in body) || !Array.isArray(body.msgs)) {
    throw new Error('Mailinator response was missing the msgs array.');
  }
  const message: unknown = body.msgs[0];
  if (!message || typeof message !== 'object' || !('id' in message) ||
      typeof message.id !== 'string' || !message.id.trim()) {
    throw new Error('Mailinator response was missing a valid msgs[0].id; the inbox may be empty.');
  }
  const linksResponse = await fetch(`${inboxUrl}/messages/${encodeURIComponent(message.id)}/links`, {
    headers: { Authorization: token },
    signal: AbortSignal.timeout(30_000)
  });
  if (!linksResponse.ok) {
    throw new Error(`Mailinator message links request failed with HTTP ${linksResponse.status}.`);
  }
  const linksBody: unknown = await linksResponse.json();
  if (!linksBody || typeof linksBody !== 'object' || !('links' in linksBody) ||
      !Array.isArray(linksBody.links) || !linksBody.links.every(link => typeof link === 'string')) {
    throw new Error('Mailinator response was missing a valid links array.');
  }
  for (const link of linksBody.links) {
    if (!URL.canParse(link)) continue;
    const url = new URL(link);
    if (url.protocol !== 'https:' || url.pathname !== '/reset-password') continue;
    if (!openBrowser) return link;
    const command = process.platform === 'darwin' ? 'open'
      : process.platform === 'win32' ? 'rundll32.exe' : 'xdg-open';
    const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', link] : [link];
    await new Promise<void>((resolve, reject) => {
      childProcess.execFile(command, args, error => {
        if (error) reject(new Error('Unable to open the reset-password link in the default browser.'));
        else resolve();
      });
    });
    return link;
  }
  throw new Error('Mailinator message did not contain an HTTPS reset-password link.');
}
