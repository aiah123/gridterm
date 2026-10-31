# Gridterm: load the user's ~/.zshrc (or $ZDOTDIR/.zshrc) first.
_gt_zdotdir=$ZDOTDIR
ZDOTDIR=${GRIDTERM_USER_ZDOTDIR:-$HOME}
[[ -r $ZDOTDIR/.zshrc ]] && builtin source $ZDOTDIR/.zshrc
GRIDTERM_USER_ZDOTDIR=$ZDOTDIR
ZDOTDIR=$_gt_zdotdir
unset _gt_zdotdir

[[ -o interactive ]] && builtin source ${ZDOTDIR}/gridterm-hooks.zsh
# For non-login shells .zshrc is the last startup file.
[[ -o login ]] || _gt_restore_zdotdir
