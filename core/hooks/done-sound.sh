#!/bin/bash
# done-sound.sh: Stop hook — play a short sound when Claude finishes responding.
# Useful when Claude is handling a long task and you've switched to another window.
#
# macOS:   afplay with a system sound
# Linux:   paplay (PulseAudio) or aplay as fallback
# Windows: PowerShell Media.SoundPlayer with chimes.wav
# Other:   exits silently
#
# Original contribution by @tjmorin03 (https://github.com/tjmorin03)

case "$(uname -s)" in
  Darwin)
    afplay /System/Library/Sounds/Glass.aiff 2>/dev/null || true
    ;;
  Linux)
    if command -v paplay &>/dev/null; then
      paplay /usr/share/sounds/freedesktop/stereo/complete.oga 2>/dev/null || true
    elif command -v aplay &>/dev/null; then
      aplay /usr/share/sounds/alsa/Front_Center.wav 2>/dev/null || true
    fi
    ;;
  MINGW*|MSYS*|CYGWIN*)
    powershell -NoProfile -Command "(New-Object Media.SoundPlayer 'C:/Windows/Media/chimes.wav').PlaySync()" 2>/dev/null || true
    ;;
esac

exit 0
