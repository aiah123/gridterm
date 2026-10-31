# Gridterm bash integration. Loaded with: bash --rcfile <this file> -i

# 1. Load the user's startup files, the way bash normally would.
if [ -n "$GRIDTERM_BASH_LOGIN" ]; then
  unset GRIDTERM_BASH_LOGIN
  [ -r /etc/profile ] && . /etc/profile
  if [ -r "$HOME/.bash_profile" ]; then . "$HOME/.bash_profile"
  elif [ -r "$HOME/.bash_login" ]; then . "$HOME/.bash_login"
  elif [ -r "$HOME/.profile" ]; then . "$HOME/.profile"
  fi
else
  [ -r /etc/bash.bashrc ] && . /etc/bash.bashrc
  [ -r "$HOME/.bashrc" ] && . "$HOME/.bashrc"
fi

# 2. Install hooks (once).
if [ -z "$__gt_installed" ] && [[ $- == *i* ]]; then
__gt_installed=1

__gt_osc() {
  local s=$2
  s=${s//\\/\\\\}
  s=${s//$'\n'/\\n}
  s=${s//$'\e'/\\e}
  s=${s//$'\a'/\\a}
  builtin printf '\e]7770;%s;%s\a' "$1" "$s"
}

__gt_ready=0        # 1 while waiting at the prompt: the next DEBUG trap is a new command
__gt_ran=0          # a command ran since the last prompt
__gt_last_hist=""

__gt_preexec() {
  local line num
  line=$(HISTTIMEFORMAT= builtin history 1)
  if [[ $line =~ ^[[:space:]]*([0-9]+)[[:space:]]+(.*)$ ]]; then
    num=${BASH_REMATCH[1]}
    line=${BASH_REMATCH[2]}
  fi
  # History can be off, or skip this command (ignorespace/ignoredups).
  if [ -z "$num" ] || [ "$num" = "$__gt_last_hist" ]; then
    line=$1
  fi
  __gt_last_hist=$num
  __gt_ran=1
  __gt_osc cmd "$line"
}

__gt_precmd() {
  local ec=$?
  if [ "$__gt_ran" = 1 ]; then __gt_osc done "$ec"; fi
  __gt_ran=0
  __gt_osc cwd "$PWD"
  return $ec
}

if declare -F __bp_install >/dev/null 2>&1 || [ -n "${bash_preexec_imported:-}" ]; then
  # bash-preexec is loaded: use its hook arrays instead of our own DEBUG trap.
  __gt_bp_preexec() { __gt_preexec "$1"; }
  preexec_functions+=(__gt_bp_preexec)
  precmd_functions=(__gt_precmd "${precmd_functions[@]}")
else
  __gt_debug() {
    [ "$__gt_ready" = 1 ] || return 0
    [ -n "${COMP_LINE:-}" ] && return 0   # tab completion
    __gt_ready=0
    __gt_preexec "$BASH_COMMAND"
  }
  __gt_prompt_start() { local ec=$?; __gt_ready=0; __gt_precmd_ec=$ec; (exit $ec); __gt_precmd; }
  __gt_prompt_end() { __gt_ready=1; }
  # Our start hook runs first (to see the command's exit code) and the end hook
  # last, so the user's own PROMPT_COMMAND doesn't look like a new command.
  PROMPT_COMMAND="__gt_prompt_start${PROMPT_COMMAND:+;$PROMPT_COMMAND};__gt_prompt_end"
  __gt_prev_debug=$(trap -p DEBUG)
  if [ -n "$__gt_prev_debug" ]; then
    eval "__gt_prev_debug_fn() { $(eval "set -- $__gt_prev_debug"; echo "$3"); }"
    trap '__gt_debug; __gt_prev_debug_fn' DEBUG
  else
    trap '__gt_debug' DEBUG
  fi
fi
fi
