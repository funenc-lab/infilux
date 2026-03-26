; Custom NSIS script for Infilux
; Register infilux:// URL scheme

!macro customInstall
  ; Register URL protocol
  WriteRegStr HKCU "Software\Classes\infilux" "" "URL:Infilux Protocol"
  WriteRegStr HKCU "Software\Classes\infilux" "URL Protocol" ""
  WriteRegStr HKCU "Software\Classes\infilux\shell\open\command" "" '"$INSTDIR\Infilux.exe" "%1"'
!macroend

!macro customUnInstall
  ; Remove URL protocol registration
  DeleteRegKey HKCU "Software\Classes\infilux"
!macroend
