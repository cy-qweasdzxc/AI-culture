import PersonaAvatar from '@/components/PersonaAvatar'
import type { Npc } from '@/types'

interface SceneParticipantsProps {
  npcs: Npc[]
  anchorId: string
  selectedIds: string[]
  disabled: boolean
  onChange: (id: string, selected: boolean) => void
}

export default function SceneParticipants({
  npcs,
  anchorId,
  selectedIds,
  disabled,
  onChange,
}: SceneParticipantsProps) {
  return (
    <fieldset disabled={disabled}>
      <legend className="text-sm font-semibold text-ink">同场角色</legend>
      <p className="mt-2 text-xs leading-6 text-bluegray">
        可邀请已经遇见的人，导演按话题安排发言。
      </p>
      <div className="mt-3 divide-y divide-line">
        {npcs.map((npc) => (
          <label key={npc.id} className="flex min-h-16 cursor-pointer items-center gap-3 py-3">
            <PersonaAvatar id={npc.id} name={npc.name} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-ink">{npc.name}</span>
              <span className="mt-1 block truncate text-xs text-bluegray">
                {npc.id === anchorId ? '当前对话角色 · 必选' : npc.title}
              </span>
            </span>
            <input
              type="checkbox"
              checked={selectedIds.includes(npc.id)}
              disabled={npc.id === anchorId || disabled}
              onChange={(event) => onChange(npc.id, event.target.checked)}
              className="h-4 w-4 shrink-0 accent-inkgreen focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cinnabar disabled:cursor-not-allowed"
              aria-label={`${npc.name}参与同场对话`}
            />
          </label>
        ))}
      </div>
      {npcs.length === 1 ? (
        <p className="mt-2 text-xs leading-6 text-bluegray">
          沿路线遇见更多角色后，可在这里邀请他们加入。
        </p>
      ) : null}
    </fieldset>
  )
}
