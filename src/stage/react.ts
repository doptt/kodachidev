import { useEffect, useSyncExternalStore } from 'react'
import { stage, type SceneStatus } from './stage'

/** The status of a scene on the stage, kept up to date. */
export function useSceneStatus(id: string): SceneStatus {
  return useSyncExternalStore(
    stage.subscribe,
    () => stage.status(id),
    () => 'idle' as SceneStatus,
  )
}

/** Asks the stage for a scene for as long as `on` is true. */
export function useShowScene(id: string, on: boolean) {
  useEffect(() => {
    if (!on) return
    return stage.show(id)
  }, [id, on])
}

/** True once the stage's canvas has had a frame drawn to it. */
export function useStageDrawn() {
  return useSyncExternalStore(
    stage.subscribe,
    () => stage.drawn,
    () => false,
  )
}
