# AI SETUP — ONE TIME

1. Replace your GitHub repository with this package.
2. Push to GitHub.
3. Vercel redeploys.
4. Keep the existing Upstash integration.
5. In Vercel → Settings → Environment Variables add:
   OPENAI_API_KEY
   OPENAI_MODEL = gpt-5.6-luna
6. Redeploy after adding the variables.
7. Login as Admin → Master → AI Content Factory.
8. Upload LBL + Detailing Story and enter Product Name.
9. Click Generate AI Package.
10. Review everything carefully.
11. Click Publish to Knowledge Hub only after approval.

Do not put the OpenAI API key in `public/index.html`.
Do not commit `.env`.

For current medical/market updates, enable the research checkbox. The server asks the Responses API to use web search. Review sources and claims before publishing.
