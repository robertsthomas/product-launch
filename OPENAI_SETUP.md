# Launch Ready - AI Setup Instructions

## AI Features Setup

Launch Ready uses OpenRouter's auto-router for intelligent text generation, OpenAI for image generation (DALL-E), and optionally Kie.ai for enhanced image generation. Users can also provide their own OpenAI API key to use OpenAI directly instead of OpenRouter.

## Steps to Fix:

1. **Get an OpenRouter API Key (Required for Text Generation):**
   - Go to [OpenRouter](https://openrouter.ai/)
   - Sign in or create an account
   - Navigate to Keys section and create a new API key
   - Copy the key (starts with `sk-`)

2. **Get an OpenAI API Key (Optional for Image Generation or Direct Text Generation):**
   - Go to [OpenAI Platform](https://platform.openai.com/api-keys)
   - Sign in or create an account
   - Create a new API key
   - Copy the key (starts with `sk-`)
   - This can be used for DALL-E image generation or direct OpenAI text generation instead of OpenRouter

3. **Add to Environment:**
   - Open your `.env` file in the project root
   - Add these lines:
   ```
   # Required for text generation (titles, descriptions, SEO, alt text)
   OPENROUTER_API_KEY=sk-your-openrouter-key-here
   OPENROUTER_MODEL=openrouter/auto
   OPENROUTER_IMAGE_MODEL=openrouter/auto

   # Optional: OpenAI API key (for DALL-E image generation fallback or direct text generation)
   OPENAI_API_KEY=sk-your-openai-key-here
   OPENAI_MODEL=gpt-4o-mini

   # Optional: For Kie.ai Nano Banana Pro image generation (recommended)
   KIE_API_KEY=your_kie_api_key_here
   ```
   - Save the file

4. **Restart the development server:**
   ```bash
   pnpm dev
   ```

## Additional Requirements:

**You also need a Pro plan subscription:**
- Since you switched to managed pricing, subscribe to a Pro plan through Shopify's hosted pricing page
- Or ensure you're using a dev store (gets Pro features for free)

## Kie.ai API Setup (Recommended for Image Generation)

Kie.ai Nano Banana Pro provides better image generation than DALL-E and will be used automatically when configured:

1. **Get a Kie.ai API Key:**
   - Go to [Kie.ai](https://kie.ai/)
   - Sign up for an account
   - Get your API key from the dashboard

2. **Add to Environment:**
   ```
   KIE_API_KEY=your_kie_api_key_here
   ```

3. **Benefits of Kie.ai Nano Banana Pro:**
   - Better image quality than DALL-E
   - Can generate images with or without reference images
   - More consistent product photography style
   - Faster generation times

**Note:** When Kie.ai is configured, it becomes the default image generation method over DALL-E.

## Cost Information:

- **OpenRouter:** Pay-as-you-go pricing, typically cheaper than direct OpenAI API. Check [OpenRouter Pricing](https://openrouter.ai/docs/pricing) for current rates
  - GPT-4o-mini: ~$0.15 per million input tokens, ~$0.60 per million output tokens
- **Kie.ai Nano Banana Pro:** Pricing varies by plan (check Kie.ai dashboard)
- **DALL-E 3 (fallback):** ~$0.08 per image (1024x1024)
- **AI Credits in App:** Pro plan includes 100 credits/month (covers both image and text generation)

## Testing:

After setting up the API keys and Pro subscription:
1. Try generating text suggestions (title, SEO title, description, tags) - should use OpenRouter auto-router
2. Try generating an image in the product editor (should use Kie.ai if configured, otherwise DALL-E)
3. Try generating alt text for existing images - should use OpenRouter auto-router
4. Check the terminal logs:
   - You should see `[OpenRouter]` messages for text generation (auto-router selects the best model)
   - You should see `[Kie.ai]` messages if Kie.ai is being used for images
   - You should see `[AI Image Generation]` if using DALL-E fallback
5. If Kie.ai fails, it will automatically fall back to DALL-E

## Using Your Own OpenAI API Key

If you want to use your own OpenAI API key directly instead of OpenRouter:

1. Set `OPENAI_API_KEY` in your `.env` file
2. The system will detect when you're using your own OpenAI key and allow you to select OpenAI models
3. You can use any OpenAI model like `gpt-4o`, `gpt-4o-mini`, etc. instead of the auto-router

**Note:** Using OpenRouter typically provides better value and access to more models, but using your own OpenAI key gives you direct control over the models used.
