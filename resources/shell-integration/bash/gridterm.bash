# Gridterm bash integration. Loaded with: bash --rcfile <this file> -i

# 0. Keep Gridterm's per-session secret in a private (unexported) variable, and
#    remove it from the environment before anything else runs, so programs
#    started from this shell can't read it and forge messages.
__gt_nonce=${GRIDTERM_NONCE-}
unset GRIDTERM_NONCE

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
if [ -z "$__gt_installed" ] && [ -n "$__gt_nonce" ] && [[ $- == *i* ]]; then
__gt_installed=1

__gt_osc() {
  local s=$2
  s=${s//\\/\\\\}
  s=${s//$'\n'/\\n}
  s=${s//$'\e'/\\e}
  s=${s//$'\a'/\\a}
  builtin printf '\e]7770;%s;%s;%s\a' "$1" "$__gt_nonce" "$s"
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
  # Only record commands bash accepted into history. Falling back to
  # BASH_COMMAND would leak commands excluded by ignorespace/HISTIGNORE,
  # or while history is disabled.
  [[ -o history ]] || return 0
  if [ -z "$num" ] || [ "$num" = "$__gt_last_hist" ]; then return 0; fi
  __gt_last_hist=$num
  __gt_ran=1
  __gt_osc cmd "$line"
}

__gt_precmd() {
  local ec=$?
  if [ "$__gt_ran" = 1 ]; then __gt_osc done "$ec"; fi
  __gt_ran=0
  # Remember the prompt's history position, including pre-existing history.
  # An excluded first command must not replay a stale history entry.
  local last
  last=$(HISTTIMEFORMAT= builtin history 1)
  if [[ $last =~ ^[[:space:]]*([0-9]+)[[:space:]] ]]; then
    __gt_last_hist=${BASH_REMATCH[1]}
  else
    __gt_last_hist=""
  fi
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
    # Prompt hooks (ours or others', e.g. systemd's) are not user commands.
    # This also covers Enter on an empty line, where the next trap is a hook.
    case $BASH_COMMAND in __gt_prompt_start*) return 0;; esac
    local __gt_pc
    for __gt_pc in "${PROMPT_COMMAND[@]}"; do
      [ "$BASH_COMMAND" = "$__gt_pc" ] && return 0
    done
    __gt_ready=0
    __gt_preexec "$BASH_COMMAND"
  }
  __gt_prompt_start() { local ec=$?; __gt_ready=0; __gt_precmd_ec=$ec; (exit $ec); __gt_precmd; }
  __gt_prompt_end() { __gt_ready=1; }
  # Our start hook runs first (to see the command's exit code) and the end hook
  # last, so the user's own PROMPT_COMMAND doesn't look like a new command.
  # PROMPT_COMMAND may be a string or (bash 5.1+) an array; systemd's
  # profile script on newer distros turns it into an array and appends to it.
  if [[ "$(declare -p PROMPT_COMMAND 2>/dev/null)" == "declare -a"* ]]; then
    PROMPT_COMMAND=(__gt_prompt_start "${PROMPT_COMMAND[@]}" __gt_prompt_end)
  else
    PROMPT_COMMAND="__gt_prompt_start${PROMPT_COMMAND:+;$PROMPT_COMMAND};__gt_prompt_end"
  fi
  __gt_prev_debug=$(trap -p DEBUG)
  if [ -n "$__gt_prev_debug" ]; then
    eval "__gt_prev_debug_fn() { $(eval "set -- $__gt_prev_debug"; echo "$3"); }"
    trap '__gt_debug; __gt_prev_debug_fn' DEBUG
  else
    trap '__gt_debug' DEBUG
  fi
fi
fi
