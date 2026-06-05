import { defineEventHandler, readBody } from 'h3'

interface ConfigBody {
  services?: unknown[]
  composites?: unknown[]
  order?: string[]
}

export default defineEventHandler(async (event) => {
  const body = await readBody<ConfigBody>(event)
  const storage = useStorage('config')

  if (body.services !== undefined) await storage.setItem('services', body.services)
  if (body.composites !== undefined) await storage.setItem('composites', body.composites)
  if (body.order !== undefined) await storage.setItem('order', body.order)

  return { ok: true }
})
