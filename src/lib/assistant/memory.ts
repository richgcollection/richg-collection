import 'server-only'
import { prisma } from '@/lib/prisma'

/** Most notes kept; the assistant is told to forget or merge old ones when full. */
export const MAX_MEMORIES = 100
export const MAX_MEMORY_LENGTH = 500

type MemoryResult = { id: string } | { error: string }

export type MemoryNote = { id: string; content: string; createdBy: string | null; createdAt: Date; updatedAt: Date }

/** Empty if the memory table can't be read (e.g. its migration hasn't run), so the assistant still works. */
export async function listMemories(): Promise<MemoryNote[]> {
  try {
    return await prisma.assistantMemory.findMany({ orderBy: { createdAt: 'asc' }, take: MAX_MEMORIES })
  } catch (err) {
    console.error('[assistant] could not load memory', err)
    return []
  }
}

export async function addMemory(content: string, createdBy: string | null): Promise<MemoryResult> {
  const text = content.trim()
  if (!text) return { error: 'The note is empty.' }
  if (text.length > MAX_MEMORY_LENGTH) return { error: `Keep notes under ${MAX_MEMORY_LENGTH} characters.` }
  const count = await prisma.assistantMemory.count()
  if (count >= MAX_MEMORIES) {
    return { error: `Memory is full (${MAX_MEMORIES} notes). Forget or update an old note first.` }
  }
  const note = await prisma.assistantMemory.create({ data: { content: text, createdBy } })
  return { id: note.id }
}

export async function updateMemory(id: string, content: string): Promise<MemoryResult> {
  const text = content.trim()
  if (!text) return { error: 'The note is empty.' }
  if (text.length > MAX_MEMORY_LENGTH) return { error: `Keep notes under ${MAX_MEMORY_LENGTH} characters.` }
  const { count } = await prisma.assistantMemory.updateMany({ where: { id }, data: { content: text } })
  return count ? { id } : { error: `No memory with id ${id}.` }
}

export async function deleteMemory(id: string): Promise<MemoryResult> {
  const { count } = await prisma.assistantMemory.deleteMany({ where: { id } })
  return count ? { id } : { error: `No memory with id ${id}.` }
}

/** The block added to the system prompt so every conversation starts with what was remembered. */
export function memoryPromptBlock(notes: MemoryNote[]): string {
  if (notes.length === 0) return 'Your memory is empty.'
  const lines = notes.map((n) => `- [${n.id}] ${n.content}`)
  return `Your memory (notes saved in earlier conversations; ids in brackets are for update_memory/forget):\n${lines.join('\n')}`
}
