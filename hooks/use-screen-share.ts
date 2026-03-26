'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type ScreenShareType = 'screen' | 'window' | 'tab' | 'browser' | 'monitor'

export interface ScreenShareOptions {
  video?: boolean
  audio?: boolean
}

export interface ScreenShareState {
  isSharing: boolean
  stream: MediaStream | null
  error: string | null
}

export function useScreenShare() {
  const [state, setState] = useState<ScreenShareState>({
    isSharing: false,
    stream: null,
    error: null,
  })

  const streamRef = useRef<MediaStream | null>(null)
  const videoTrackRef = useRef<MediaStreamTrack | null>(null)
  const stopShareRef = useRef<(() => void) | null>(null)

  const stopShare = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }

    videoTrackRef.current = null

    setState({
      isSharing: false,
      stream: null,
      error: null,
    })
  }, [])

  stopShareRef.current = stopShare

  useEffect(() => {
    return () => {
      stopShareRef.current?.()
    }
  }, [])

  const startShare = useCallback(async (options: ScreenShareOptions = { video: true, audio: true }) => {
    try {
      setState(prev => ({ ...prev, error: null }))

      const displayMediaOptions: DisplayMediaStreamOptions = {
        video: options.video
          ? {
              displaySurface: 'browser',
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              frameRate: { ideal: 30 },
            }
          : false,
        audio: options.audio,
      }

      const stream = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions)
      streamRef.current = stream

      const videoTrack = stream.getVideoTracks()[0]
      const audioTrack = stream.getAudioTracks()[0]
      videoTrackRef.current = videoTrack

      const displaySurface = videoTrack.getSettings().displaySurface
      let streamType: ScreenShareType = 'screen'

      if (displaySurface === 'browser') {
        streamType = 'browser'
      }
      else if (displaySurface === 'window') {
        streamType = 'window'
      }
      else if (displaySurface === 'monitor') {
        streamType = 'monitor'
      }

      stream.addEventListener('inactive', () => {
        stopShareRef.current?.()
      })

      setState({
        isSharing: true,
        stream,
        error: null,
      })

      return { stream, streamType, hasAudio: Boolean(audioTrack) }
    }
    catch (error) {
      const message = error instanceof Error ? error.message : '屏幕共享启动失败'
      setState(prev => ({ ...prev, error: message, isSharing: false }))
      return null
    }
  }, [])

  const getStreamType = useCallback((track: MediaStreamTrack): ScreenShareType => {
    const displaySurface = track.getSettings().displaySurface

    if (displaySurface === 'browser') {
      return 'browser'
    }

    if (displaySurface === 'window') {
      return 'window'
    }

    if (displaySurface === 'monitor') {
      return 'monitor'
    }

    return 'screen'
  }, [])

  return {
    ...state,
    startShare,
    stopShare,
    getStreamType,
    stream: streamRef.current,
  }
}
