// index.js
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import FormData from 'form-data';
import { AtpAgent } from '@atproto/api';
import { fileURLToPath } from 'url';

// Load .env
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const postsFile = path.join(__dirname, 'data/posts.json');
const savedPosts = fs.existsSync(postsFile)
    ? JSON.parse(fs.readFileSync(postsFile, 'utf-8'))
    : [];

const SINCE_DATE = new Date(process.env.SINCE_DATE);

function postHash(post) {
    return post.uri;
}

async function uploadImageToMastodon(url, altText) {
    const imageRes = await fetch(url);
    const buffer = await imageRes.arrayBuffer();

    const form = new FormData();
    form.append('file', Buffer.from(buffer), {
        filename: 'image.jpg',
        contentType: imageRes.headers.get('content-type') || 'image/jpeg',
    });
    form.append('description', altText);

    const response = await fetch(`${process.env.MASTODON_URL}/api/v1/media`, {
        method: 'POST',
        headers: {
            ...form.getHeaders(), // ✅ важливо!
            Authorization: `Bearer ${process.env.MASTODON_TOKEN}`,
        },
        body: form,
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to upload media: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return data.id;
}

async function postToMastodon(text, mediaIds = []) {
    const response = await fetch(`${process.env.MASTODON_URL}/api/v1/statuses`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.MASTODON_TOKEN}`,
        },
        body: JSON.stringify({
            status: text,
            media_ids: mediaIds,
            visibility: 'public',
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to post status: ${response.status} ${errorText}`);
    }
}

async function syncBlueskyToMastodon() {
    const agent = new AtpAgent({
        service: 'https://bsky.social',
    });

    await agent.login({
        identifier: process.env.BLUESKY_HANDLE,
        password: process.env.BLUESKY_PASSWORD
    });

    const timeline = await agent.app.bsky.feed.getAuthorFeed({
        actor: process.env.BLUESKY_HANDLE,
    });

    for (const post of timeline.data.feed) {
        const createdAt = new Date(post.post.record.createdAt);
        const hash = postHash(post.post);

        console.log(`🕣 SINCE DATE is ${SINCE_DATE} and post date is ${createdAt}`);

        if (createdAt <= SINCE_DATE || savedPosts.includes(hash)) continue;
        
        console.log(`✅ PROCESSING POST AS SINCE DATE is ${SINCE_DATE} and post date is ${createdAt}`);
        const record = post.post.record;

        // ✅ Skip replies
        if (record?.reply) {
            console.log(`⏭️ Skipped reply: ${record.text.slice(0, 30)}...`);
            savedPosts.push(hash);
            continue;
        }

        const embed = post.post.embed;

        // ✅ Skip posts with video
        if (embed?.$type === 'app.bsky.embed.external' && embed.external?.mimeType?.startsWith('video/')) {
            console.log(`⏭️ Skipped video post: ${record.text.slice(0, 30)}...`);
            savedPosts.push(hash);
            continue;
        }

        let text = record.text || '';
        const mediaIds = [];

        console.log(`👷‍♂️ PROCESSING POST - ${record.text.slice(0, 30)}`);

        // ✅ Upload only images with retry
        if (embed?.images?.length > 0) {
            for (const img of embed.images) {
                const maxRetries = 3;
                let attempt = 0;
                let success = false;

                while (attempt < maxRetries && !success) {
                    try {
                        const mediaId = await uploadImageToMastodon(img.fullsize, img.alt || '');
                        mediaIds.push(mediaId);
                        success = true;
                    } catch (err) {
                        attempt++;
                        console.error(`❌ Media upload failed (attempt ${attempt}): ${err.message}`);
                        if (attempt < maxRetries) {
                            const delay = 1000 * attempt; // exponential backoff (1s, 2s, 3s)
                            console.log(`🔁 Retrying in ${delay / 1000}s...`);
                            await new Promise((r) => setTimeout(r, delay));
                        } else {
                            console.error(`🚫 Giving up on this image after ${maxRetries} attempts.`);
                        }
                    }
                }
            }
        }

        try {
            await postToMastodon(text, mediaIds);
            savedPosts.push(hash);
            fs.writeFileSync(postsFile, JSON.stringify(savedPosts, null, 2));
            console.log(`✅ Posted: ${text.slice(0, 30)}...`);
        } catch (err) {
            console.error(`❌ Posting failed: ${err.message}`);
        }
    }
}

syncBlueskyToMastodon();