import { defineEventHandler } from 'h3'

export default defineEventHandler(async () => {
  const storage = useStorage('config')
  const services = await storage.getItem('services') ?? []
  const composites = await storage.getItem('composites') ?? []
  const order = await storage.getItem('order') ?? []
  const levels = await storage.getItem('levels') ?? []
  return { services, composites, order, levels }
})
