from PIL import Image, ImageDraw, ImageFont

# 图片参数
def create_placeholder(path, text):
    img = Image.new('RGB', (300, 200), color=(220, 220, 220))
    d = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype('Arial.ttf', 24)
    except:
        font = ImageFont.load_default()
    # 使用textbbox获取文本尺寸
    bbox = d.textbbox((0, 0), text, font=font)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    d.text(((300-w)/2, (200-h)/2), text, fill=(80, 80, 80), font=font)
    img.save(path)

create_placeholder('screenshot-popup.png', 'Popup Example')
create_placeholder('screenshot-progress.png', 'Progress Example') 