import { defineCollection, z } from 'astro:content';

const insights = defineCollection({
    type: 'content',
    schema: z.object({
        title: z.string(),
        excerpt: z.string().optional(),
        publishedAt: z.date(),
        category: z.string().optional(),
        draft: z.boolean().default(false),
    }),
});

const caseStudies = defineCollection({
    type: 'content',
    schema: z.object({
        title: z.string(),
        excerpt: z.string().optional(),
        publishedAt: z.date(),
        client: z.string().optional(),
        draft: z.boolean().default(false),
    }),
});

export const collections = {
    insights,
    'case-studies': caseStudies,
};
