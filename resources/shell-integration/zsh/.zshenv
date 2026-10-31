# Gridterm: load the user's ~/.zshenv (or $ZDOTDIR/.zshenv) first.
_gt_zdotdir=$ZDOTDIR
ZDOTDIR=${GRIDTERM_USER_ZDOTDIR:-$HOME}
[[ -r $ZDOTDIR/.zshenv ]] && builtin source $ZDOTDIR/.zshenv
GRIDTERM_USER_ZDOTDIR=$ZDOTDIR
ZDOTDIR=$_gt_zdotdir
unset _gt_zdotdir

# Put the user's ZDOTDIR back once startup is done, so nested shells and
# anything else that reads ZDOTDIR see the user's real setting.
_gt_restore_zdotdir() {
  if [[ $GRIDTERM_USER_ZDOTDIR == $HOME ]]; then
    unset ZDOTDIR
  else
    export ZDOTDIR=$GRIDTERM_USER_ZDOTDIR
  fi
  unset GRIDTERM_USER_ZDOTDIR
  unfunction _gt_restore_zdotdir
}

# Non-interactive shells (e.g. `zsh script.sh`) read only .zshenv.
[[ -o interactive ]] || _gt_restore_zdotdir
