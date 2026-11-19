import type { ModerationTarget } from './Moderation'

export function moderationPath(target: ModerationTarget): string {
  return '/moderation/' + target.kind + '/' + target.id
}

