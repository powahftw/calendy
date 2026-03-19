import toast from 'react-hot-toast';

export const showUndoToast = (message: string, onUndo: () => void) => {
    toast.custom((t) => (
        <div
            className="custom-toast undo-toast"
            onClick={() => toast.dismiss(t.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    toast.dismiss(t.id);
                }
            }}
        >
            <span>{message}</span>
            <button
                type="button"
                onClick={(event) => {
                    event.stopPropagation();
                    onUndo();
                    toast.dismiss(t.id);
                }}
                className="undo-toast-action"
            >
                Undo
            </button>
        </div>
    ), { duration: 5000 });
};
