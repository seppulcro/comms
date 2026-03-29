import { useEffect, useRef } from 'preact/hooks'

function Nf({ i }: { i: string }) {
  return <span class="nf">{i}</span>
}

interface ScreenShareProps {
  stream: MediaStream
  sharingUser: string
  isLocal: boolean
  onStop?: () => void
}

export function ScreenShare({ stream, sharingUser, isLocal, onStop }: ScreenShareProps) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
    }
  }, [stream])

  return (
    <div class="screen-share-viewer">
      <div class="screen-share-bar">
        <span><Nf i={"\uf108"} /> {isLocal ? 'You are sharing your screen' : `${sharingUser} is sharing their screen`}</span>
        {isLocal && onStop && (
          <button variant-="red" onClick={onStop} class="delete-btn"><Nf i={"\uf04d"} /> Stop Sharing</button>
        )}
      </div>
      <video ref={videoRef} autoPlay playsInline muted={isLocal} />
    </div>
  )
}
