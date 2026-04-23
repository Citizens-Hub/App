import { useState } from "react";
import { FormattedMessage, IntlShape, useIntl } from "react-intl";
import { Typography, TableContainer, TableHead, TableRow, TableCell, TableBody, TablePagination, Box, Table, Button, Dialog, DialogTitle, DialogContent } from "@mui/material";
import { useCatchedErrors } from "@/hooks/swr/admin/useCatchedErrors";
import { ErrorTypes } from "@/types";
import { Bug, ShieldQuestion } from "lucide-react";

const ColoredStack = ({ stack }: { stack: string }) => {
  const fragments: { text: string; type: string }[] = [];

  const regex =
    /(at)\s+([A-Za-z0-9_$<>]+)|\((https?:\/\/[^\s)]+:\d+:\d+)\)|(https?:\/\/[^\s)]+:\d+:\d+)/g;

  let lastIndex = 0;
  let match;

  while ((match = regex.exec(stack)) !== null) {
    if (match.index > lastIndex) {
      fragments.push({ text: stack.slice(lastIndex, match.index), type: "normal" });
    }

    if (match[1] && match[2]) {
      fragments.push({ text: match[1], type: "at" });         // at → 黑色
      fragments.push({ text: " ", type: "normal" });
      fragments.push({ text: match[2], type: "component" });  // ComponentName → 绿色
    } else if (match[3]) {
      fragments.push({ text: "(", type: "normal" });
      fragments.push({ text: match[3], type: "url" });
      fragments.push({ text: ")", type: "normal" });
    } else if (match[4]) {
      fragments.push({ text: match[4], type: "url" });
    }

    lastIndex = regex.lastIndex;
  }

  // 追加尾部普通文本
  if (lastIndex < stack.length) {
    fragments.push({ text: stack.slice(lastIndex), type: "normal" });
  }

  return (
    <Box
      component="pre"
      sx={{
        whiteSpace: "pre-wrap",
        wordBreak: "break-all",
        bgcolor: "#f5f5f5",
        p: 2,
        borderRadius: 1,
        fontFamily: "monospace",
        fontSize: 14,
        maxHeight: "70vh",
        overflow: "auto",
      }}
    >
      {fragments.map((f, i) => (
        <Box
          key={i}
          component="span"
          sx={{
            color:
              f.type === "component"
                ? "#2e7d32"
                : f.type === "url"
                  ? "#1976d2"
                  : "inherit",
            fontWeight: f.type === "component" ? 600 : "normal",
          }}
        >
          {f.text}
        </Box>
      ))}
    </Box>
  );
}

function formatErrorDate(value: string, locale: string) {
  return new Date(value).toLocaleString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getErrorTypeMeta(errorType: string, intl: IntlShape) {
  switch (errorType) {
    case ErrorTypes.BUYBACK_CCU_PARSING_ERROR:
      return {
        icon: <Bug className="w-4 h-4 text-yellow-400" />,
        label: intl.formatMessage({
          id: 'admin.errors.buybackParsing',
          defaultMessage: 'Buyback Parsing Error',
        }),
      };
    case ErrorTypes.RENDER_ERROR:
      return {
        icon: <Bug className="w-4 h-4 text-red-400" />,
        label: intl.formatMessage({
          id: 'admin.errors.renderError',
          defaultMessage: 'Render Error',
        }),
      };
    case ErrorTypes.CCU_PARSING_ERROR:
      return {
        icon: <Bug className="w-4 h-4 text-yellow-400" />,
        label: intl.formatMessage({
          id: 'admin.errors.ccuParsing',
          defaultMessage: 'CCU Parsing Error',
        }),
      };
    default:
      return {
        icon: <ShieldQuestion className="w-4 h-4 text-red-400" />,
        label: intl.formatMessage(
          {
            id: 'admin.errors.unknown',
            defaultMessage: 'Unknown Error: {errorType}',
          },
          { errorType },
        ),
      };
  }
}

export default function ErrorsTable() {
  const intl = useIntl();
  const [page, setPage] = useState(0);
  const [showCallStack, setShowCallStack] = useState("")
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const { isLoading, data } = useCatchedErrors(page + 1, rowsPerPage)

  if (isLoading) {
    return <Typography align="center"><FormattedMessage id="loading" defaultMessage="Loading..." /></Typography>
  }

  if (!data) {
    return <Box sx={{ textAlign: 'center', py: 4 }}>
      <Typography variant="h6">
        <FormattedMessage id="admin.noErrors" defaultMessage="No errors been catched now" />
      </Typography>
    </Box>
  }

  const { total, list } = data

  // 处理分页
  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  return (<>
    <Box sx={{ width: '100%', overflow: 'auto' }}>
      <TableContainer sx={{ mb: 2 }}>
        <Table aria-label={intl.formatMessage({ id: 'admin.errors.table.ariaLabel', defaultMessage: 'Errors table' })}>
          <TableHead>
            <TableRow>
              <TableCell>
                {intl.formatMessage({ id: 'admin.errors.date', defaultMessage: 'Date' })}
              </TableCell>
              <TableCell>
                {intl.formatMessage({ id: 'admin.errors.type', defaultMessage: 'Error Type' })}
              </TableCell>
              <TableCell>
                {intl.formatMessage({ id: 'admin.errors.message', defaultMessage: 'Error Message' })}
              </TableCell>
              <TableCell align="center">
                {intl.formatMessage({ id: 'admin.errors.stack', defaultMessage: 'Stack' })}
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {list.map(item => (
              <TableRow key={item.id} hover>
                <TableCell className="text-nowrap">
                  {formatErrorDate(item.createdAt, intl.locale)}
                </TableCell>
                <TableCell className="text-nowrap">
                  <div className="flex items-center gap-2">
                    {(() => {
                      const meta = getErrorTypeMeta(item.errorType, intl);
                      return (
                        <>
                          {meta.icon}
                          {meta.label}
                        </>
                      );
                    })()}
                  </div>
                </TableCell>
                <TableCell>
                  {
                    item.errorMessage
                  }
                </TableCell>
                <TableCell>
                  <Button
                    disabled={!item.callStack}
                    onClick={() => {
                      setShowCallStack(item.callStack || "")
                    }}>
                    {intl.formatMessage({ id: 'common.view', defaultMessage: 'View' })}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {/* {paginatedEquipment.map((item) => (
                <TableRow key={item.id} hover>

                </TableRow>
              ))} */}
          </TableBody>
        </Table>
      </TableContainer>

      <TablePagination
        rowsPerPageOptions={[5, 10, 25]}
        component="div"
        count={total}
        rowsPerPage={rowsPerPage}
        page={page}
        onPageChange={handleChangePage}
        onRowsPerPageChange={handleChangeRowsPerPage}
        labelRowsPerPage={intl.formatMessage({ id: 'pagination.rowsPerPage', defaultMessage: 'Rows per page:' })}
        labelDisplayedRows={({ from, to, count }) => `${from}-${to} / ${intl.formatMessage({ id: 'pagination.total', defaultMessage: 'Total' })}${count}${intl.formatMessage({ id: 'pagination.items', defaultMessage: ' items' })}`}
      />
    </Box>

    <Dialog open={!!showCallStack} onClose={() => setShowCallStack("")} maxWidth="xl" fullWidth>
      <DialogTitle>
        {intl.formatMessage({ id: 'admin.errors.stackTitle', defaultMessage: 'Error Stack' })}
      </DialogTitle>
      <DialogContent>
        <ColoredStack stack={showCallStack ?? ""} />
      </DialogContent>
    </Dialog>
  </>)
}
