# ALKEM DIABETOLOGY — MEDICO MARKETING ARENA — AI KNOWLEDGE v5

## New in v5

### AI Content Factory
Admin can enter a Product Name and upload:
- LBL / visual
- Detailing Story

The AI reads the supplied material and drafts:
- Drug / generic name
- MOA
- Differentiators
- 8–12 game questions
- Correct answers + explanations
- Flashcards
- MOA animation steps
- 60–90 second video learning storyboard
- Medical / market update brief
- Source notes + confidence

**Safety rule:** product-specific medical claims are treated as drafts and the AI is instructed not to guess unsupported drug/MOA information. Admin approval is required before publishing.

### Increase Knowledge
Players get a dedicated:
- Product Library
- MOA Animation
- Medico-Marketing Material
- Video Learning
- Medical & Market Updates
- AI Knowledge Feed

Approved knowledge can later feed LBL, Rapid Fire, Cricket and Ludo question banks.

### Current research
When enabled, the AI generation request uses OpenAI's Responses API web search tool to research current medical/market updates. OpenAI documents the Responses API and web-search tool for this workflow.

## Environment variables
Keep your existing Vercel Upstash variables:
- KV_REST_API_URL
- KV_REST_API_TOKEN

Add:
- JWT_SECRET
- ADMIN_EMAIL
- ADMIN_PASSWORD
- OPENAI_API_KEY
- OPENAI_MODEL=gpt-5.6-luna

Keep `OPENAI_API_KEY` server-side in Vercel Environment Variables. Never put it in frontend code or GitHub.

## Branding
The portal is branded:
**ALKEM DIABETOLOGY • NAGPUR REGION**
A local SVG wordmark is included at `public/alkem-wordmark.svg`. If your team has the official approved Alkem logo asset, replace that SVG with the approved corporate asset.

Official Alkem website:
https://www.alkemlabs.com/

## Deployment
Replace the GitHub repository contents with this package once.
Do not create another Redis database.
After push, Vercel redeploys.

## AI cost
AI API usage is billed separately by the AI provider. OpenAI's current API documentation and pricing should be checked before enabling heavy automated generation.
