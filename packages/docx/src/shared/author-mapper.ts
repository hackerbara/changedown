export interface DocxAuthor {
  displayName: string;
  initials: string;
}

export function toDocxAuthor(author: string): DocxAuthor {
  const noAt = author.startsWith('@') ? author.slice(1) : author;

  if (noAt.startsWith('ai:')) {
    return { displayName: noAt, initials: 'AI' };
  }

  if (noAt === 'unknown') {
    return { displayName: 'Unknown Author', initials: 'U' };
  }

  const parts = noAt.split('-').filter(Boolean);
  const displayName = parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');

  const initials = parts
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('') || 'U';

  return { displayName: displayName || 'Unknown Author', initials };
}

export function toChangeTracksAuthor(displayName: string): string {
  if (!displayName) return '@unknown';

  if (displayName.startsWith('ai:')) {
    return '@' + displayName;
  }

  if (displayName === 'Unknown Author') {
    return '@unknown';
  }

  return '@' + displayName.toLowerCase().replace(/\s+/g, '-');
}
