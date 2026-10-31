# Gridterm: load the user's ~/.zprofile (or $ZDOTDIR/.zprofile) first.
_gt_zdotdir=$ZDOTDIR
ZDOTDIR=${GRIDTERM_USER_ZDOTDIR:-$HOME}
[[ -r $ZDOTDIR/.zprofile ]] && builtin source $ZDOTDIR/.zprofile
GRIDTERM_USER_ZDOTDIR=$ZDOTDIR
ZDOTDIR=$_gt_zdotdir
unset _gt_zdotdir
