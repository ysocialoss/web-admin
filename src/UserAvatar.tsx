export default function UserAvatar({ src, size = 32 }: { src: string | null; size?: number }) {
  return <img className="admin-user-avatar" alt="" width={size} height={size} src={src || '/avatar.png'}
    decoding="async" onError={event => {
      if (event.currentTarget.getAttribute('src') !== '/avatar.png') event.currentTarget.src = '/avatar.png'
    }} />
}
