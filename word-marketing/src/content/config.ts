import { defineCollection, z } from 'astro:content';

const pages = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    showInNav: z.boolean().default(false),
    navOrder: z.number().optional(),
    ogImage: z.string().optional(),
    updatedAt: z.coerce.date().optional(),
  }),
});
const tutorials = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    level: z.enum(['intro', 'intermediate', 'advanced']),
    duration: z.string(),
    publishedAt: z.coerce.date(),
    prerequisites: z.array(z.string()).optional(),
  }),
});
const posts = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    author: z.string(),
    publishedAt: z.coerce.date(),
    tags: z.array(z.string()).default([]),
  }),
});
const verticals = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    audience: z.enum(['editors', 'lawyers', 'academics']),
    primaryScreenshot: z.string().optional(),
    painPoints: z.array(z.string()).default([]),
  }),
});

export const collections = { pages, tutorials, posts, verticals };
