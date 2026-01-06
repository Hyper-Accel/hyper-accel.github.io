#!/bin/bash
# GIF 압축 스크립트

cd "$(dirname "$0")"

if [ ! -f "systolic_array.gif" ]; then
    echo "Error: systolic_array.gif 파일을 찾을 수 없습니다."
    exit 1
fi

echo "GIF 압축을 시작합니다..."
echo "원본 파일 크기:"
ls -lh systolic_array.gif | awk '{print $5, $9}'

# 방법 1: MP4로 변환 (가장 효과적)
if command -v ffmpeg >/dev/null 2>&1; then
    echo ""
    echo "MP4로 변환 중 (가장 효과적)..."
    ffmpeg -i systolic_array.gif -vf "scale=640:269" -pix_fmt yuv420p -movflags +faststart systolic_array.mp4 -y 2>/dev/null
    
    if [ -f "systolic_array.mp4" ]; then
        OLD_SIZE=$(ls -lh systolic_array.gif | awk '{print $5}')
        NEW_SIZE=$(ls -lh systolic_array.mp4 | awk '{print $5}')
        echo "  완료: $OLD_SIZE -> $NEW_SIZE"
        
        # 크기 비교
        OLD_BYTES=$(stat -f%z systolic_array.gif 2>/dev/null || stat -c%s systolic_array.gif 2>/dev/null)
        NEW_BYTES=$(stat -f%z systolic_array.mp4 2>/dev/null || stat -c%s systolic_array.mp4 2>/dev/null)
        REDUCTION=$(echo "scale=1; (1 - $NEW_BYTES / $OLD_BYTES) * 100" | bc)
        echo "  크기 감소: ${REDUCTION}%"
    fi
else
    echo "ffmpeg가 설치되어 있지 않습니다."
    echo "설치: sudo apt-get install -y ffmpeg"
fi

# 방법 2: gifsicle로 최적화 (GIF 유지)
if command -v gifsicle >/dev/null 2>&1; then
    echo ""
    echo "GIF 최적화 중 (gifsicle)..."
    gifsicle -O3 --colors 256 systolic_array.gif -o systolic_array_optimized.gif 2>/dev/null
    
    if [ -f "systolic_array_optimized.gif" ]; then
        OLD_SIZE=$(ls -lh systolic_array.gif | awk '{print $5}')
        NEW_SIZE=$(ls -lh systolic_array_optimized.gif | awk '{print $5}')
        echo "  완료: $OLD_SIZE -> $NEW_SIZE"
        
        # 크기 비교
        OLD_BYTES=$(stat -f%z systolic_array.gif 2>/dev/null || stat -c%s systolic_array.gif 2>/dev/null)
        NEW_BYTES=$(stat -f%z systolic_array_optimized.gif 2>/dev/null || stat -c%s systolic_array_optimized.gif 2>/dev/null)
        REDUCTION=$(echo "scale=1; (1 - $NEW_BYTES / $OLD_BYTES) * 100" | bc)
        echo "  크기 감소: ${REDUCTION}%"
    fi
else
    echo "gifsicle이 설치되어 있지 않습니다."
    echo "설치: sudo apt-get install -y gifsicle"
fi

echo ""
echo "최종 결과:"
ls -lh systolic_array.* 2>/dev/null | awk '{print $5, $9}' | sort -h

