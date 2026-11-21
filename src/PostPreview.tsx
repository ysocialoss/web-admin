import { useState } from 'react'
import { Callout, Icon, NonIdealState } from '@blueprintjs/core'
import type { AdminPostGif } from './adminApi'

export function PostGif({ gif, compact = false }: { gif: NonNullable<AdminPostGif>; compact?: boolean }) {
  const [failedUrl, setFailedUrl] = useState<string>()
  if (failedUrl === gif.url) return compact
    ? <span className="admin-gif-thumbnail admin-gif-placeholder" aria-label="GIF unavailable"><Icon icon="media" /></span>
    : <NonIdealState icon="media" title="GIF unavailable" description={gif.title || undefined} />

  return <img src={gif.url} alt={gif.title || 'GIF'} referrerPolicy="no-referrer" decoding="async"
    loading={compact ? 'lazy' : undefined} className={compact ? 'admin-gif-thumbnail' : 'admin-post-media'}
    onError={() => setFailedUrl(gif.url)} />
}

export function PostVoice({ url, compact = false }: { url: string; compact?: boolean }) {
  const [failedUrl, setFailedUrl] = useState<string>()
  return failedUrl === url
    ? <Callout intent="warning" icon="volume-off">Voice message unavailable.</Callout>
    : <audio src={url} controls preload="none" aria-label="Voice message"
        className={compact ? 'admin-voice-preview' : 'admin-post-media'}
        onError={() => setFailedUrl(url)} />
}

export function PostImage({ url, alt, compact = false }: { url: string; alt: string; compact?: boolean }) {
  const [failed, setFailed] = useState(false)
  if (failed) return compact
    ? <span className="admin-gif-thumbnail admin-gif-placeholder" aria-label="Image unavailable"><Icon icon="media" /></span>
    : <Callout intent="warning" icon="media">Image unavailable.</Callout>
  return <img src={url} alt={alt}
    decoding="async" loading="lazy" className={compact ? 'admin-gif-thumbnail' : 'admin-post-media'}
    onError={() => setFailed(true)} />
}

export default function PostPreview({ content, gif, voiceUrl, imageIds }: {
  content: string; gif: AdminPostGif; voiceUrl: string | null; imageIds: string[]
}) {
  const imageId = imageIds[0]
  if (!gif && !imageId) return <span className="admin-content-excerpt">{content || (voiceUrl ? 'Voice message' : 'Open media post')}</span>
  return <span className="admin-post-preview">
    {imageId ? <PostImage key={imageId} url={`/api/admin/post-images/${imageId}`} alt="" compact /> : gif && <PostGif gif={gif} compact />}
    <span className="admin-content-excerpt">{content || (imageId ? 'Image attachment' : gif?.title || 'GIF post')}</span>
  </span>
}
