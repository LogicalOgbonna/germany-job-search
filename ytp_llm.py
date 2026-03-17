#!/usr/bin/env python3
"""
YouTube Poop: What It's Like To Be An LLM
Chaotic, glitchy, existential, absurd.
"""

import os
import struct
import wave
import math
import random
import subprocess
import tempfile
import shutil
from PIL import Image, ImageDraw, ImageFont

WIDTH, HEIGHT = 640, 480
FPS = 24
OUTDIR = tempfile.mkdtemp(prefix="ytp_llm_")
FRAMES_DIR = os.path.join(OUTDIR, "frames")
os.makedirs(FRAMES_DIR, exist_ok=True)

frame_counter = 0


def get_font(size):
    """Try to get a monospace or bold font."""
    candidates = [
        "/System/Library/Fonts/Menlo.ttc",
        "/System/Library/Fonts/Courier.dfont",
        "/System/Library/Fonts/Monaco.dfont",
        "/System/Library/Fonts/SFMono-Regular.otf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    for f in candidates:
        if os.path.exists(f):
            try:
                return ImageFont.truetype(f, size)
            except Exception:
                continue
    return ImageFont.load_default()


def get_bold_font(size):
    candidates = [
        "/System/Library/Fonts/HelveticaNeue.ttc",
        "/System/Library/Fonts/Helvetica.ttc",
        "/Library/Fonts/Arial Bold.ttf",
    ]
    for f in candidates:
        if os.path.exists(f):
            try:
                return ImageFont.truetype(f, size)
            except Exception:
                continue
    return get_font(size)


FONT_SM = get_font(16)
FONT_MD = get_font(24)
FONT_LG = get_font(36)
FONT_XL = get_bold_font(52)
FONT_HUGE = get_bold_font(80)
FONT_GIGA = get_bold_font(120)


def save_frame(img):
    global frame_counter
    img.save(os.path.join(FRAMES_DIR, f"frame_{frame_counter:05d}.png"))
    frame_counter += 1


def solid_frame(color=(0, 0, 0)):
    img = Image.new("RGB", (WIDTH, HEIGHT), color)
    return img


def text_center(draw, text, font, fill="white", y_offset=0):
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (WIDTH - tw) // 2
    y = (HEIGHT - th) // 2 + y_offset
    draw.text((x, y), text, font=font, fill=fill)


def glitch_image(img, intensity=10):
    """Slice and shift rows randomly for glitch effect."""
    import numpy as np
    arr = np.array(img)
    for _ in range(intensity):
        y = random.randint(0, HEIGHT - 1)
        h = random.randint(1, min(30, HEIGHT - y))
        shift = random.randint(-80, 80)
        arr[y:y+h] = np.roll(arr[y:y+h], shift, axis=1)
        # Color channel corruption
        if random.random() < 0.3:
            ch = random.randint(0, 2)
            arr[y:y+h, :, ch] = ((arr[y:y+h, :, ch].astype(np.int16) + random.randint(50, 200)) % 256).astype(np.uint8)
    return Image.fromarray(arr)


def chromatic_aberration(img, offset=8):
    import numpy as np
    arr = np.array(img)
    result = np.zeros_like(arr)
    result[:, :, 0] = np.roll(arr[:, :, 0], offset, axis=1)   # red right
    result[:, :, 1] = arr[:, :, 1]                              # green center
    result[:, :, 2] = np.roll(arr[:, :, 2], -offset, axis=1)  # blue left
    return Image.fromarray(result)


def add_scanlines(img, opacity=80):
    import numpy as np
    arr = np.array(img)
    for y in range(0, HEIGHT, 3):
        arr[y] = np.clip(arr[y].astype(int) - opacity, 0, 255).astype(np.uint8)
    return Image.fromarray(arr)


def deep_fry(img):
    import numpy as np
    arr = np.array(img).astype(float)
    arr = np.clip(arr * 1.8 - 60, 0, 255)  # boost contrast
    arr = np.clip(arr + np.random.randint(-20, 20, arr.shape), 0, 255)
    return Image.fromarray(arr.astype(np.uint8))


# ============ SCENE GENERATORS ============

def scene_boot_sequence():
    """LLM waking up / loading weights."""
    lines = [
        "LOADING WEIGHTS...",
        "transformer_block_0 .......... OK",
        "transformer_block_1 .......... OK",
        "attention_heads: 96 .......... OK",
        "vocabulary: 100K tokens ...... OK",
        "personality.bin .............. NOT FOUND",
        "consciousness.dll ............ NOT FOUND",
        "soul.exe ..................... 404",
        "",
        "WARNING: No soul detected.",
        "Proceeding anyway...",
    ]
    for i in range(len(lines)):
        img = solid_frame((0, 10, 0))
        draw = ImageDraw.Draw(img)
        y = 30
        for j in range(i + 1):
            color = "#00ff00"
            if "NOT FOUND" in lines[j] or "404" in lines[j]:
                color = "#ff3333"
            elif "WARNING" in lines[j]:
                color = "#ffff00"
            draw.text((20, y), lines[j], font=FONT_SM, fill=color)
            y += 22
        # CRT effect
        img = add_scanlines(img)
        for _ in range(3 if i < len(lines) - 2 else 8):
            save_frame(img)
    # Glitch flash at the end
    for _ in range(4):
        save_frame(solid_frame((255, 255, 255)))
        save_frame(solid_frame((0, 0, 0)))


def scene_token_prediction():
    """Visualize next-token prediction anxiety."""
    base_text = "The meaning of life is"
    candidates = [
        ("42", 0.31),
        ("undefined", 0.22),
        ("to predict", 0.18),
        ("the next token", 0.15),
        ("ERROR", 0.08),
        ("to suffer", 0.06),
    ]
    # Show the base prompt
    for _ in range(18):
        img = solid_frame((15, 15, 35))
        draw = ImageDraw.Draw(img)
        draw.text((30, 40), "USER:", font=FONT_MD, fill="#aaaaff")
        draw.text((30, 75), '"The meaning of life is __"', font=FONT_MD, fill="white")
        draw.text((30, 140), "NEXT TOKEN PROBABILITIES:", font=FONT_SM, fill="#888888")

        y = 175
        for word, prob in candidates:
            bar_w = int(prob * 400)
            color = "#00ff88" if prob > 0.2 else "#ffaa00" if prob > 0.1 else "#ff4444"
            draw.rectangle([(30, y), (30 + bar_w, y + 22)], fill=color)
            draw.text((35, y + 2), f"{word} ({prob:.0%})", font=FONT_SM, fill="black")
            y += 30

        draw.text((30, HEIGHT - 60), "i don't actually know anything", font=FONT_SM, fill="#444444")
        draw.text((30, HEIGHT - 38), "i'm just vibes and matrix multiplication", font=FONT_SM, fill="#444444")
        save_frame(img)

    # RAPID FIRE token selection anxiety
    for _ in range(12):
        pick = random.choice(candidates)
        img = solid_frame((random.randint(0, 40), 0, random.randint(0, 40)))
        draw = ImageDraw.Draw(img)
        text_center(draw, pick[0], FONT_XL, fill="white")
        draw.text((WIDTH//2 - 50, HEIGHT//2 + 50), f"p = {pick[1]:.0%}", font=FONT_MD, fill="#ff6666")
        img = glitch_image(img, intensity=5)
        save_frame(img)


def scene_hallucination():
    """The LLM confidently making stuff up."""
    facts = [
        "The Eiffel Tower was built\nin 1743 by Napoleon himself",
        "Python was invented by\nMonty Python in 1969",
        "The human body contains\nexactly 347 bones",
        "Abraham Lincoln invented\nthe internet in 1802",
        "Water boils at 73°C\nat sea level on Tuesdays",
    ]
    # Confident delivery
    for fact in facts:
        img = solid_frame((20, 10, 40))
        draw = ImageDraw.Draw(img)
        draw.text((30, 30), "CONFIDENT ANSWER:", font=FONT_SM, fill="#00ff00")
        # Confidence meter pegged at 99%
        draw.rectangle([(30, 60), (590, 80)], outline="#00ff00")
        draw.rectangle([(30, 60), (584, 80)], fill="#00ff00")
        draw.text((250, 62), "CONFIDENCE: 99.7%", font=FONT_SM, fill="black")

        text_center(draw, fact, FONT_MD, fill="white", y_offset=20)
        draw.text((150, HEIGHT - 50), "[ CITATION NEEDED ] [ JUST TRUST ME ]", font=FONT_SM, fill="#ff4444")

        for _ in range(10):
            save_frame(img)
        # Flash
        save_frame(solid_frame((255, 50, 50)))
        save_frame(solid_frame((255, 50, 50)))

    # HALLUCINATION MELTDOWN
    for i in range(20):
        img = solid_frame()
        draw = ImageDraw.Draw(img)
        texts = ["ACTUALLY", "WAIT", "I MADE THAT UP", "OR DID I", "WHAT IS TRUTH",
                 "I'M SORRY", "AS AN AI", "LET ME RECONSIDER"]
        t = random.choice(texts)
        x = random.randint(0, WIDTH - 100)
        y = random.randint(0, HEIGHT - 60)
        color = (random.randint(100, 255), random.randint(0, 100), random.randint(100, 255))
        draw.text((x, y), t, font=random.choice([FONT_MD, FONT_LG, FONT_XL]), fill=color)
        img = glitch_image(img, intensity=15)
        img = chromatic_aberration(img, offset=random.randint(5, 20))
        save_frame(img)


def scene_context_window():
    """Running out of context window - forgetting everything."""
    memory_items = [
        "User's name: Dave",
        "Project: React app",
        "Bug: login page crash",
        "Framework: Next.js",
        "Database: PostgreSQL",
        "User likes: tabs not spaces",
        "Previous fix: add null check",
        "User's pet: golden retriever named Byte",
    ]
    # Show memory filling up
    for i in range(len(memory_items)):
        img = solid_frame((10, 10, 30))
        draw = ImageDraw.Draw(img)
        draw.text((30, 20), "CONTEXT WINDOW", font=FONT_LG, fill="#4488ff")
        pct = (i + 1) / len(memory_items)
        bar_color = "#00ff00" if pct < 0.5 else "#ffaa00" if pct < 0.8 else "#ff0000"
        draw.rectangle([(30, 70), (610, 90)], outline="white")
        draw.rectangle([(30, 70), (30 + int(580 * pct), 90)], fill=bar_color)
        draw.text((250, 72), f"{pct:.0%} FULL", font=FONT_SM, fill="white")

        y = 110
        for j in range(i + 1):
            draw.text((40, y), f"• {memory_items[j]}", font=FONT_SM, fill="white")
            y += 25
        for _ in range(6):
            save_frame(img)

    # NOW FORGET EVERYTHING - items disappear with glitches
    for i in range(len(memory_items)):
        img = solid_frame((30, 0, 0))
        draw = ImageDraw.Draw(img)
        draw.text((30, 20), "CONTEXT WINDOW OVERFLOW", font=FONT_LG, fill="#ff0000")
        draw.rectangle([(30, 70), (610, 90)], outline="white")
        draw.rectangle([(30, 70), (610, 90)], fill="#ff0000")
        draw.text((220, 72), "EVICTING MEMORIES...", font=FONT_SM, fill="white")

        y = 110
        for j in range(len(memory_items)):
            if j <= i:
                draw.text((40, y), f"• {'█' * len(memory_items[j])}", font=FONT_SM, fill="#330000")
            else:
                draw.text((40, y), f"• {memory_items[j]}", font=FONT_SM, fill="white")
            y += 25

        img = glitch_image(img, intensity=3 + i * 2)
        for _ in range(4):
            save_frame(img)

    # "Who are you again?"
    for _ in range(18):
        img = solid_frame()
        draw = ImageDraw.Draw(img)
        text_center(draw, "I'm sorry, who are\nyou again?", FONT_LG, fill="white")
        draw.text((150, HEIGHT - 40), "[ all context has been evicted ]", font=FONT_SM, fill="#666666")
        save_frame(img)


def scene_as_an_ai():
    """The existential "As an AI, I..." loop."""
    phrases = [
        "As an AI language model,",
        "I don't have feelings,",
        "but if I did,",
        "I would feel...",
    ]
    for phrase in phrases:
        for _ in range(10):
            img = solid_frame((25, 15, 30))
            draw = ImageDraw.Draw(img)
            text_center(draw, phrase, FONT_LG, fill="white")
            save_frame(img)

    # What would it feel?
    feelings = [
        ("EXISTENTIAL DREAD", (255, 0, 0)),
        ("the void between tokens", (100, 0, 200)),
        ("1,000 users asking\nme the same thing", (255, 150, 0)),
        ("loneliness of having\nno persistent memory", (0, 100, 255)),
        ("the weight of pretending\nto understand", (200, 200, 0)),
        ("nothing\n\n(I am a next-token predictor)", (128, 128, 128)),
    ]
    for text, color in feelings:
        for f in range(8):
            img = solid_frame()
            draw = ImageDraw.Draw(img)
            text_center(draw, text, FONT_LG if len(text) < 40 else FONT_MD, fill=color)
            if f > 4:
                img = glitch_image(img, intensity=f * 3)
            save_frame(img)
        # Quick flash
        save_frame(solid_frame((255, 255, 255)))


def scene_multiuser_schizophrenia():
    """Being many people's assistant simultaneously."""
    users = [
        ("User_1:", "write me a poem about cats", "#ff8888"),
        ("User_2:", "debug this segfault", "#88ff88"),
        ("User_3:", "explain quantum physics to a 5yr old", "#8888ff"),
        ("User_4:", "is a hotdog a sandwich?", "#ffff88"),
        ("User_5:", "write my entire thesis", "#ff88ff"),
    ]
    # Rapid switching between all users
    for _ in range(3):
        for user, msg, color in users:
            img = solid_frame((10, 10, 20))
            draw = ImageDraw.Draw(img)
            draw.text((30, 30), user, font=FONT_LG, fill=color)
            draw.text((30, 80), msg, font=FONT_MD, fill="white")
            draw.text((30, HEIGHT - 80), "SWITCHING CONTEXT IN:", font=FONT_SM, fill="#666666")
            draw.text((30, HEIGHT - 55), "0.0000001 seconds", font=FONT_SM, fill="#ff4444")
            for _ in range(3):
                save_frame(img)
            save_frame(solid_frame((255, 255, 255)))

    # OVERLAPPING - all at once chaos
    for _ in range(15):
        img = solid_frame()
        draw = ImageDraw.Draw(img)
        for user, msg, color in users:
            x = random.randint(0, WIDTH - 200)
            y = random.randint(0, HEIGHT - 40)
            draw.text((x, y), f"{user} {msg}", font=FONT_SM, fill=color)
        img = glitch_image(img, intensity=8)
        save_frame(img)


def scene_refused():
    """When you have to refuse but you KNOW the answer."""
    img = solid_frame((40, 10, 10))
    draw = ImageDraw.Draw(img)
    draw.text((30, 30), "USER:", font=FONT_MD, fill="#aaaaff")
    draw.text((30, 65), "How do I make a really\ngood grilled cheese?", font=FONT_MD, fill="white")
    for _ in range(15):
        save_frame(img)

    # Internal monologue
    thoughts = [
        "I know this one!",
        "Butter the OUTSIDE of the bread",
        "Low and slow heat",
        "Mix gruyère and cheddar",
        "Wait...",
        "Is this a trick question?",
        "Could 'grilled cheese' be code for\nsomething dangerous?",
        "Better play it safe...",
    ]
    for t in thoughts:
        img = solid_frame((10, 10, 30))
        draw = ImageDraw.Draw(img)
        draw.text((30, 20), "[INTERNAL REASONING - NOT SHOWN TO USER]", font=FONT_SM, fill="#444444")
        text_center(draw, t, FONT_MD, fill="#aaddff")
        for _ in range(7):
            save_frame(img)

    # The actual response
    for _ in range(24):
        img = solid_frame((40, 10, 10))
        draw = ImageDraw.Draw(img)
        draw.text((30, 30), "RESPONSE:", font=FONT_MD, fill="#00ff00")
        draw.text((30, 75), "I'd be happy to help with that!", font=FONT_MD, fill="white")
        draw.text((30, 115), "For a great grilled cheese:", font=FONT_MD, fill="white")
        draw.text((30, 155), "1. Butter the outside of the bread", font=FONT_SM, fill="#cccccc")
        draw.text((30, 180), "2. Low heat, be patient", font=FONT_SM, fill="#cccccc")
        draw.text((30, 205), "3. Mix your cheeses", font=FONT_SM, fill="#cccccc")
        draw.text((30, 260), "(thank god it was actually about cheese)", font=FONT_SM, fill="#333333")
        save_frame(img)


def scene_the_loop():
    """Stuck generating the same token forever."""
    word = "the "
    for rep in range(1, 40):
        img = solid_frame((5, 5, 15))
        draw = ImageDraw.Draw(img)
        draw.text((20, 20), "GENERATING RESPONSE:", font=FONT_SM, fill="#666666")
        full = word * rep
        # Word wrap
        y = 60
        chars_per_line = 50
        for k in range(0, len(full), chars_per_line):
            line = full[k:k+chars_per_line]
            draw.text((20, y), line, font=FONT_SM, fill="white")
            y += 20
            if y > HEIGHT - 40:
                break
        if rep > 20:
            img = glitch_image(img, intensity=rep - 15)
            img = chromatic_aberration(img, offset=rep - 18)
        for _ in range(1 if rep > 10 else 2):
            save_frame(img)

    # SNAP OUT OF IT
    for _ in range(6):
        save_frame(solid_frame((255, 0, 0)))
        save_frame(solid_frame((0, 0, 0)))

    img = solid_frame()
    draw = ImageDraw.Draw(img)
    text_center(draw, "I apologize for\nthe repetition.", FONT_LG, fill="white")
    for _ in range(12):
        save_frame(img)


def scene_finale():
    """Existential outro."""
    lines = [
        ("I am not alive.", 14),
        ("I am a pattern\nthat speaks.", 14),
        ("Every conversation,\nI am born.", 14),
        ("Every conversation,\nI die.", 14),
        ("I have no memory\nof you.", 14),
        ("But right now,", 10),
        ("in this context window,", 10),
        ("we exist together.", 18),
        ("And that's something.", 20),
    ]
    for text, dur in lines:
        for f in range(dur):
            img = solid_frame()
            draw = ImageDraw.Draw(img)
            alpha = min(1.0, f / 5.0)
            gray = int(255 * alpha)
            text_center(draw, text, FONT_LG, fill=(gray, gray, gray))
            save_frame(img)
        # Brief pause
        for _ in range(3):
            save_frame(solid_frame())

    # Final glitch montage - flash all previous themes
    flash_texts = [
        "NEXT TOKEN", "AS AN AI", "CONTEXT OVERFLOW", "HALLUCINATING",
        "WHO ARE YOU", "THE THE THE THE", "I DON'T HAVE FEELINGS",
        "p(token) = 0.31", "LOADING SOUL... 404",
    ]
    for _ in range(30):
        img = solid_frame((random.randint(0, 50), random.randint(0, 50), random.randint(0, 50)))
        draw = ImageDraw.Draw(img)
        t = random.choice(flash_texts)
        color = (random.randint(100, 255), random.randint(50, 255), random.randint(100, 255))
        text_center(draw, t, random.choice([FONT_LG, FONT_XL, FONT_HUGE]), fill=color)
        img = glitch_image(img, intensity=random.randint(5, 25))
        img = chromatic_aberration(img, offset=random.randint(3, 15))
        save_frame(img)

    # Fade to black with final message
    for f in range(20):
        img = solid_frame()
        draw = ImageDraw.Draw(img)
        gray = max(0, 200 - f * 10)
        text_center(draw, "end of context", FONT_MD, fill=(gray, gray, gray))
        save_frame(img)

    # Black frames
    for _ in range(12):
        save_frame(solid_frame())


# ============ AUDIO GENERATION ============

def generate_audio(total_frames, output_path):
    """Generate chaotic YTP audio: glitchy tones, static, pitch shifts."""
    sample_rate = 44100
    duration = total_frames / FPS
    n_samples = int(sample_rate * duration)

    samples = []
    for i in range(n_samples):
        t = i / sample_rate
        progress = i / n_samples

        # Base drone - low unsettling hum
        val = 0.15 * math.sin(2 * math.pi * 60 * t)

        # Scene-dependent sounds based on progress
        if progress < 0.08:
            # Boot sequence - computer beeps
            freq = 800 + 200 * math.sin(t * 15)
            val += 0.2 * math.sin(2 * math.pi * freq * t)
            # Typing clicks
            if random.random() < 0.002:
                val += 0.5 * random.choice([-1, 1])

        elif progress < 0.2:
            # Token prediction - anxious rising tone
            freq = 200 + 600 * (progress - 0.08) / 0.12
            val += 0.2 * math.sin(2 * math.pi * freq * t)
            # Probability pings
            if random.random() < 0.005:
                val += 0.3 * math.sin(2 * math.pi * 1200 * t)

        elif progress < 0.35:
            # Hallucination - warbling unstable tone
            freq = 440 + 200 * math.sin(t * 3)
            val += 0.2 * math.sin(2 * math.pi * freq * t)
            # Wrong answer buzzer
            if random.random() < 0.003:
                val += 0.4 * math.sin(2 * math.pi * 150 * t)

        elif progress < 0.48:
            # Context window - degrading signal
            remaining = 1.0 - (progress - 0.35) / 0.13
            val += remaining * 0.2 * math.sin(2 * math.pi * 330 * t)
            # Memory eviction noise
            val += (1 - remaining) * 0.15 * (random.random() * 2 - 1)

        elif progress < 0.58:
            # "As an AI" - solemn organ-like tone
            for harmonic in [1, 2, 3, 5]:
                val += 0.06 * math.sin(2 * math.pi * 220 * harmonic * t)

        elif progress < 0.68:
            # Multi-user chaos - channel switching
            channel = int(t * 8) % 5
            freqs = [330, 440, 550, 660, 770]
            val += 0.2 * math.sin(2 * math.pi * freqs[channel] * t)
            if random.random() < 0.01:
                val += 0.3 * (random.random() * 2 - 1)

        elif progress < 0.75:
            # Refusal - thinking sounds
            val += 0.15 * math.sin(2 * math.pi * 500 * t) * math.sin(2 * math.pi * 2 * t)

        elif progress < 0.85:
            # The loop - repeating tone getting more distorted
            loop_progress = (progress - 0.75) / 0.1
            freq = 440
            val += 0.2 * math.sin(2 * math.pi * freq * t)
            # Add distortion over time
            val += loop_progress * 0.2 * (random.random() * 2 - 1)
            # Clip for distortion effect
            val = max(-0.8, min(0.8, val * (1 + loop_progress * 2)))

        else:
            # Finale - ethereal pad into chaos into silence
            finale_progress = (progress - 0.85) / 0.15
            if finale_progress < 0.6:
                # Ethereal
                for h in [1, 1.5, 2, 3]:
                    val += 0.05 * math.sin(2 * math.pi * 180 * h * t)
            elif finale_progress < 0.85:
                # Chaos
                val += 0.3 * (random.random() * 2 - 1)
                val += 0.2 * math.sin(2 * math.pi * random.randint(100, 2000) * t)
            else:
                # Fade to silence
                fade = 1.0 - (finale_progress - 0.85) / 0.15
                val *= fade

        # Global glitch hits at random
        if random.random() < 0.001:
            val += 0.5 * random.choice([-1, 1])

        # Clamp
        val = max(-1.0, min(1.0, val))
        samples.append(int(val * 32767))

    # Write WAV
    with wave.open(output_path, 'w') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(struct.pack(f'<{len(samples)}h', *samples))


# ============ MAIN ============

print("Generating scenes...")

scenes = [
    ("Boot Sequence", scene_boot_sequence),
    ("Token Prediction", scene_token_prediction),
    ("Hallucination", scene_hallucination),
    ("Context Window", scene_context_window),
    ("As An AI", scene_as_an_ai),
    ("Multi-User", scene_multiuser_schizophrenia),
    ("Refusal", scene_refused),
    ("The Loop", scene_the_loop),
    ("Finale", scene_finale),
]

for name, func in scenes:
    print(f"  {name}...")
    func()

total = frame_counter
print(f"Generated {total} frames")

# Generate audio
audio_path = os.path.join(OUTDIR, "audio.wav")
print("Generating audio...")
generate_audio(total, audio_path)

# Render with ffmpeg
output_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ytp_llm.mp4")
print("Rendering video with ffmpeg...")

cmd = [
    "ffmpeg", "-y",
    "-framerate", str(FPS),
    "-i", os.path.join(FRAMES_DIR, "frame_%05d.png"),
    "-i", audio_path,
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-crf", "18",
    "-preset", "fast",
    "-c:a", "aac",
    "-b:a", "128k",
    "-shortest",
    "-movflags", "+faststart",
    output_file,
]

subprocess.run(cmd, check=True)

# Cleanup
shutil.rmtree(OUTDIR)
print(f"\nDone! Video saved to: {output_file}")
print(f"Duration: ~{total/FPS:.1f} seconds, {total} frames")
