# Gridterm zsh hooks.
[[ -n $_gt_installed || -z ${_gt_nonce-} ]] && return
typeset -g _gt_installed=1 _gt_ran=0

_gt_osc() {
  local s=$2
  s=${s//\\/\\\\}
  s=${s//$'\n'/\\n}
  s=${s//$'\e'/\\e}
  s=${s//$'\a'/\\a}
  builtin printf '\e]7770;%s;%s;%s\a' "$1" "$_gt_nonce" "$s"
}

_gt_preexec() {
  # Leading-space commands are private, including HIST_IGNORE_SPACE sessions.
  # Treat them conservatively even when that shell option is not enabled.
  # zsh clamps HISTSIZE=0 to 1 internally.
  [[ $1 == ' '* || $HISTSIZE -le 1 ]] && return 0
  _gt_ran=1
  _gt_osc cmd "$1"   # $1 is the command line as typed
}

_gt_precmd() {
  local ec=$?
  (( _gt_ran )) && _gt_osc done $ec
  _gt_ran=0
  _gt_osc cwd "$PWD"
}

autoload -Uz add-zsh-hook
add-zsh-hook preexec _gt_preexec
add-zsh-hook precmd _gt_precmd
