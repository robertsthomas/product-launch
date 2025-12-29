# Launch Ready - AI Setup Instructions

## AI Features Setup

Launch Ready uses AI for image generation and text suggestions. Both features require API keys to be configured.

## Steps to Fix:

1. **Get an OpenAI API Key:**
   - Go to [OpenAI Platform](https://platform.openai.com/api-keys)
   - Sign in or create an account
   - Create a new API key
   - Copy the key (it starts with `sk-`)

2. **Add to Environment:**
   - Open your `.env` file in the project root
   - Add these lines:
   ```
   OPENAI_API_KEY=sk-your-actual-api-key-here
   OPENAI_MODEL=gpt-4.1-mini
   OPENAI_IMAGE_MODEL=gpt-4.1-mini
   KIE_API_KEY=your_kie_api_key_here
   ```
   - Save the file

3. **Restart the development server:**
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

- **Kie.ai Nano Banana Pro:** Pricing varies by plan (check Kie.ai dashboard)
- **DALL-E 3 (fallback):** ~$0.08 per image (1024x1024)
- **GPT-4 Text Generation:** ~$0.01 per 1K tokens
- **AI Credits in App:** Pro plan includes 100 credits/month (covers both image and text generation)

## Testing:

After setting up the API keys and Pro subscription:
1. Try generating an image in the product editor (should use Kie.ai Nano Banana Pro if configured)
2. Try generating alt text for existing images
3. Check the terminal logs - you should see `[Kie.ai]` messages if Kie.ai is being used
4. If Kie.ai fails, it will automatically fall back to DALL-E
