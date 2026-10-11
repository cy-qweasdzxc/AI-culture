/** 仅为界面推荐问题；回答、证据、动作全部来自服务端。 */
export function suggestedChoices(npcId: string, hasClue: (id: string) => boolean): string[] {
  if (npcId === 'zhou-bo')
    return [
      '平江路的格局有什么讲究？',
      '《平江图》是什么？',
      hasClue('clue-tea-ticket') ? '周伯，您认得这张茶票吗？' : '丁香巷和《雨巷》有关系吗？',
    ]
  if (npcId === 'a-heng')
    return ['耦园为什么改名？', '狮子林始建于什么朝代？', '拙政园的名字怎么来的？']
  if (npcId === 'xiao-shen')
    return ['贝聿铭是怎么设计新馆的？', '片石假山妙在哪里？', '守园灯是什么？']
  return []
}
