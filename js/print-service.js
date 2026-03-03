export async function printData(type) {
    if (!window.currentListId) return Swal.fire('', 'لیست دیاری نەکراوە', 'error');

    if (type === 'envelope') {
        const { value: monthName } = await Swal.fire({
            title: 'مانگی چەند؟',
            input: 'select',
            inputOptions: {
                'مانگی 1': 'مانگی 1', 'مانگی 2': 'مانگی 2', 'مانگی 3': 'مانگی 3', 'مانگی 4': 'مانگی 4',
                'مانگی 5': 'مانگی 5', 'مانگی 6': 'مانگی 6', 'مانگی 7': 'مانگی 7', 'مانگی 8': 'مانگی 8',
                'مانگی 9': 'مانگی 9', 'مانگی 10': 'مانگی 10', 'مانگی 11': 'مانگی 11', 'مانگی 12': 'مانگی 12'
            },
            inputPlaceholder: 'مانگێک هەڵبژێرە',
            showCancelButton: true, confirmButtonText: 'چاپکردن', cancelButtonText: 'پاشگەزبوونەوە'
        });
        if (monthName) {
            window.open(`print.html?listId=${window.currentListId}&type=${type}&month=${encodeURIComponent(monthName)}`, '_blank');
        }
    } else {
        const now = new Date();
        const month = String(now.getMonth() + 1).padStart(2, '0'); 
        const year = now.getFullYear();
        const defaultText = `لیستی موچەی مانگی ${month}/${year}`;
        const { value: customDateText } = await Swal.fire({
            title: 'ناونیشانی لیست', input: 'text', inputLabel: 'سەردێڕی لیستەکە چی بێت؟',
            inputValue: defaultText, showCancelButton: true, confirmButtonText: 'چاپکردن', cancelButtonText: 'پاشگەزبوونەوە'
        });
        if (customDateText !== undefined) { 
            window.open(`print.html?listId=${window.currentListId}&type=list&dateText=${encodeURIComponent(customDateText)}`, '_blank');
        }
    }
}