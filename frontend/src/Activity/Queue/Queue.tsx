import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { SelectProvider, useSelect } from 'App/Select/SelectContext';
import CommandNames from 'Commands/CommandNames';
import { useCommandExecuting, useExecuteCommand } from 'Commands/useCommands';
import Alert from 'Components/Alert';
import LoadingIndicator from 'Components/Loading/LoadingIndicator';
import FilterMenu from 'Components/Menu/FilterMenu';
import PageContent from 'Components/Page/PageContent';
import PageContentBody from 'Components/Page/PageContentBody';
import PageHeading from 'Components/Page/PageHeading';
import PageMessage from 'Components/Page/PageMessage';
import { OverflowDivider } from 'Components/Page/Toolbar/Overflow';
import PageToolbar from 'Components/Page/Toolbar/PageToolbar';
import PageToolbarSeparator from 'Components/Page/Toolbar/PageToolbarSeparator';
import PageToolbarSpacer from 'Components/Page/Toolbar/PageToolbarSpacer';
import ToolbarItem from 'Components/Page/Toolbar/ToolbarItem';
import Table from 'Components/Table/Table';
import TableBody from 'Components/Table/TableBody';
import TableOptionsModal from 'Components/Table/TableOptions/TableOptionsModal';
import TablePager from 'Components/Table/TablePager';
import useEpisodes from 'Episode/useEpisodes';
import EpisodeFileProvider from 'EpisodeFile/EpisodeFileProvider';
import { useCustomFiltersList } from 'Filters/useCustomFilters';
import { align, icons, kinds } from 'Helpers/Props';
import { SortDirection } from 'Helpers/Props/sortDirections';
import InteractiveImportModal from 'InteractiveImport/InteractiveImportModal';
import useSeries from 'Series/useSeries';
import { CheckInputChanged } from 'typings/inputs';
import QueueModel from 'typings/Queue';
import { TableOptionsChangePayload } from 'typings/Table';
import selectUniqueIds from 'Utilities/Object/selectUniqueIds';
import {
  registerPagePopulator,
  unregisterPagePopulator,
} from 'Utilities/pagePopulator';
import translate from 'Utilities/String/translate';
import QueueFilterModal from './QueueFilterModal';
import {
  setQueueOption,
  setQueueOptions,
  setQueueSort,
  useQueueOptions,
} from './queueOptionsStore';
import {
  forceRefreshQueue,
  refreshQueue,
  setQueueRefreshBlocked,
} from './queueRefresh';
import QueueRow from './QueueRow';
import QueueSeriesGroup from './QueueSeriesGroup';
import RemoveQueueItemModal from './RemoveQueueItemModal';
import useQueueStatus from './Status/useQueueStatus';
import useQueue, {
  useFilters,
  useGrabQueueItems,
  useRemoveQueueItems,
  useResumeQueueItems,
} from './useQueue';

function QueueContent() {
  const executeCommand = useExecuteCommand();

  const {
    records,
    totalPages,
    totalRecords,
    error,
    isFetching,
    isLoading,
    isPlaceholderData,
    page,
    goToPage,
  } = useQueue();

  const {
    columns,
    pageSize,
    sortKey,
    sortDirection,
    selectedFilterKey,
    groupBySeries,
  } = useQueueOptions();

  const filters = useFilters();
  const { seriesMap } = useSeries();

  const { isRemoving, removeQueueItems } = useRemoveQueueItems();
  const { isGrabbing, grabQueueItems } = useGrabQueueItems();
  const { isResuming, resumeQueueItems } = useResumeQueueItems();

  const { count } = useQueueStatus();

  const episodeIds = useMemo(() => {
    return selectUniqueIds<QueueModel, number>(records, 'episodeIds');
  }, [records]);

  const {
    data: episodes,
    isFetching: isEpisodesFetching,
    isFetched: isEpisodesFetched,
    isPlaceholderData: isEpisodesPlaceholderData,
    error: episodesError,
  } = useEpisodes({ episodeIds }, { keepPreviousData: true });

  const episodeFileIds = useMemo(() => {
    return Array.from(
      new Set(
        episodes
          .map((e) => e.episodeFileId)
          .filter((id): id is number => !!id && id > 0)
      )
    );
  }, [episodes]);

  const customFilters = useCustomFiltersList('queue');

  const isRefreshMonitoredDownloadsExecuting = useCommandExecuting(
    CommandNames.RefreshMonitoredDownloads
  );

  const manualRefreshState = useRef<'idle' | 'requested' | 'executing'>('idle');

  const { allSelected, allUnselected, selectAll, unselectAll, useSelectedIds } =
    useSelect<QueueModel>();

  const selectedIds = useSelectedIds();
  const isPendingSelected = useMemo(() => {
    return records.some((item) => {
      return selectedIds.indexOf(item.id) > -1 && item.status === 'delay';
    });
  }, [records, selectedIds]);

  const pausedSelectedIds = useMemo(() => {
    return selectedIds.filter((id) => {
      const item = records.find((i) => i.id === id);
      return item?.status === 'paused';
    });
  }, [records, selectedIds]);

  const isPausedSelected = pausedSelectedIds.length > 0;

  const completedDownloadIds = useMemo(
    () =>
      selectedIds
        .map((id) => {
          const item = records.find(
            (i) => i.id === id && i.status === 'completed'
          );

          return item?.downloadId;
        })
        .filter((id): id is string => !!id),
    [records, selectedIds]
  );

  const [isQueueRowModalOpen, setIsQueueRowModalOpen] = useState(false);

  const [isConfirmRemoveModalOpen, setIsConfirmRemoveModalOpen] =
    useState(false);

  const [isInteractiveImportDownloadIds, setIsInteractiveImportDownloadIds] =
    useState<string[]>(() => []);

  const isRefreshing =
    isLoading || isEpisodesFetching || isRefreshMonitoredDownloadsExecuting;

  // Use isLoading over isFetched to avoid losing the table UI when switching pages
  const isAllPopulated =
    !isLoading &&
    (isEpisodesFetched ||
      isEpisodesPlaceholderData ||
      !records.length ||
      records.every((e) => !e.episodeIds?.length));
  const hasError = error || episodesError;
  const selectedCount = selectedIds.length;
  const disableSelectedActions = selectedCount === 0;
  const disableImportSelected =
    selectedCount === 0 || completedDownloadIds.length === 0;

  const isRefreshBlocked =
    selectedCount > 0 ||
    isQueueRowModalOpen ||
    isConfirmRemoveModalOpen ||
    isInteractiveImportDownloadIds.length > 0 ||
    isRemoving ||
    isGrabbing ||
    isResuming;

  const seriesGroups = useMemo(() => {
    const groups = new Map<string, { seriesId?: number; items: QueueModel[] }>();

    records.forEach((item) => {
      const key =
        item.seriesId !== undefined ? String(item.seriesId) : 'unknown';
      const existing = groups.get(key);

      if (existing) {
        existing.items.push(item);
      } else {
        groups.set(key, {
          seriesId: item.seriesId,
          items: [item],
        });
      }
    });

    return Array.from(groups.entries())
      .map(([key, value]) => ({
        key,
        ...value,
        sortTitle:
          value.seriesId !== undefined
            ? seriesMap.get(value.seriesId)?.sortTitle ?? ''
            : '\uffff',
      }))
      .sort((a, b) => a.sortTitle.localeCompare(b.sortTitle));
  }, [records, seriesMap]);

  const [expandedSeriesState, setExpandedSeriesState] = useState<
    Record<string, boolean>
  >({});

  const allSeriesExpanded = useMemo(() => {
    if (seriesGroups.length === 0) {
      return true;
    }

    return seriesGroups.every(
      (group) => expandedSeriesState[group.key] ?? true
    );
  }, [seriesGroups, expandedSeriesState]);

  const handleExpandSeriesPress = useCallback(
    (seriesKey: string, isExpanded: boolean) => {
      setExpandedSeriesState((prev) => ({
        ...prev,
        [seriesKey]: isExpanded,
      }));
    },
    []
  );

  const handleExpandAllPress = useCallback(() => {
    const nextExpanded = !allSeriesExpanded;
    const nextState: Record<string, boolean> = {};

    seriesGroups.forEach((group) => {
      nextState[group.key] = nextExpanded;
    });

    setExpandedSeriesState(nextState);
  }, [allSeriesExpanded, seriesGroups]);

  const handleToggleGroupBySeriesPress = useCallback(() => {
    setQueueOption('groupBySeries', !groupBySeries);
  }, [groupBySeries]);

  const handleSelectAllChange = useCallback(
    ({ value }: CheckInputChanged) => {
      if (value) {
        selectAll();
      } else {
        unselectAll();
      }
    },
    [selectAll, unselectAll]
  );

  const handleRefreshPress = useCallback(() => {
    manualRefreshState.current = 'requested';

    executeCommand({
      name: CommandNames.RefreshMonitoredDownloads,
    });
  }, [executeCommand]);

  const handleQueueRowModalOpenOrClose = useCallback((isOpen: boolean) => {
    setIsQueueRowModalOpen(isOpen);
  }, []);

  const handleGrabSelectedPress = useCallback(() => {
    grabQueueItems({ ids: selectedIds });
  }, [selectedIds, grabQueueItems]);

  const handleResumeSelectedPress = useCallback(() => {
    if (pausedSelectedIds.length > 0) {
      resumeQueueItems({ ids: pausedSelectedIds });
    }
  }, [pausedSelectedIds, resumeQueueItems]);

  const handleRemoveSelectedPress = useCallback(() => {
    setIsConfirmRemoveModalOpen(true);
  }, [setIsConfirmRemoveModalOpen]);

  const handleRemoveSelectedConfirmed = useCallback(() => {
    removeQueueItems({ ids: selectedIds });
    setIsConfirmRemoveModalOpen(false);
  }, [selectedIds, removeQueueItems]);

  const handleConfirmRemoveModalClose = useCallback(() => {
    setIsConfirmRemoveModalOpen(false);
  }, []);

  const handleImportSelectedPress = useCallback(() => {
    setIsInteractiveImportDownloadIds(completedDownloadIds);
  }, [completedDownloadIds]);

  const handleImportSelectedModalClose = useCallback(() => {
    setIsInteractiveImportDownloadIds([]);
  }, []);

  const handleFilterSelect = useCallback(
    (selectedFilterKey: string | number) => {
      setQueueOption('selectedFilterKey', selectedFilterKey);
    },
    []
  );

  const handleSortPress = useCallback(
    (sortKey: string, sortDirection?: SortDirection) => {
      setQueueSort({
        sortKey,
        sortDirection,
      });
    },
    []
  );

  const handleTableOptionChange = useCallback(
    (payload: TableOptionsChangePayload) => {
      setQueueOptions(payload);

      if (payload.pageSize) {
        goToPage(1);
      }
    },
    [goToPage]
  );

  const [isTableOptionsModalOpen, setIsTableOptionsModalOpen] = useState(false);

  const handleTableOptionsPress = useCallback(() => {
    setIsTableOptionsModalOpen(true);
  }, []);

  const handleTableOptionsModalClose = useCallback(() => {
    setIsTableOptionsModalOpen(false);
  }, []);

  useEffect(() => {
    setQueueRefreshBlocked(isRefreshBlocked);
  }, [isRefreshBlocked]);

  useEffect(() => {
    if (isRefreshMonitoredDownloadsExecuting) {
      if (manualRefreshState.current === 'requested') {
        manualRefreshState.current = 'executing';
      }

      return;
    }

    if (manualRefreshState.current === 'executing') {
      manualRefreshState.current = 'idle';
      forceRefreshQueue();
    }
  }, [isRefreshMonitoredDownloadsExecuting]);

  useEffect(() => {
    registerPagePopulator(refreshQueue);

    return () => {
      unregisterPagePopulator(refreshQueue);
      setQueueRefreshBlocked(false);
    };
  }, []);

  return (
    <PageContent title={translate('Queue')}>
      <PageToolbar>
        <ToolbarItem
          id="refresh"
          priority={1}
          groupId="left-a"
          label={translate('Refresh')}
          iconName={icons.REFRESH}
          isSpinning={isLoading || isRefreshMonitoredDownloadsExecuting}
          onPress={handleRefreshPress}
        />

        <OverflowDivider groupId="left-a">
          <PageToolbarSeparator />
        </OverflowDivider>

        <ToolbarItem
          id="grab-selected"
          priority={1}
          groupId="left-b"
          label={translate('GrabSelected')}
          iconName={icons.DOWNLOAD}
          isDisabled={disableSelectedActions || !isPendingSelected}
          isSpinning={isGrabbing}
          onPress={handleGrabSelectedPress}
        />

        <ToolbarItem
          id="resume-selected"
          priority={1}
          groupId="left-b"
          label={translate('ResumeSelected')}
          iconName={icons.RESUME}
          isDisabled={disableSelectedActions || !isPausedSelected}
          isSpinning={isResuming}
          onPress={handleResumeSelectedPress}
        />

        <ToolbarItem
          id="remove-selected"
          priority={1}
          groupId="left-b"
          label={translate('RemoveSelected')}
          iconName={icons.REMOVE}
          isDisabled={disableSelectedActions}
          isSpinning={isRemoving}
          onPress={handleRemoveSelectedPress}
        />

        <OverflowDivider groupId="left-b">
          <PageToolbarSeparator />
        </OverflowDivider>

        <ToolbarItem
          id="import-selected"
          priority={1}
          groupId="left-c"
          label={translate('ImportSelected')}
          iconName={icons.INTERACTIVE}
          isDisabled={disableImportSelected}
          onPress={handleImportSelectedPress}
        />

        <PageToolbarSpacer />

        {groupBySeries ? (
          <ToolbarItem
            id="expand-all"
            priority={2}
            groupId="right"
            label={
              allSeriesExpanded
                ? translate('CollapseAll')
                : translate('ExpandAll')
            }
            iconName={allSeriesExpanded ? icons.COLLAPSE : icons.EXPAND}
            isDisabled={!records.length}
            onPress={handleExpandAllPress}
          />
        ) : null}

        <ToolbarItem
          id="group-by-series"
          priority={2}
          groupId="right"
          label={
            groupBySeries
              ? translate('Ungroup')
              : translate('GroupBySeries')
          }
          iconName={groupBySeries ? icons.UNGROUP : icons.GROUP}
          onPress={handleToggleGroupBySeriesPress}
        />

        <ToolbarItem
          id="options"
          priority={2}
          groupId="right"
          label={translate('Options')}
          iconName={icons.TABLE}
          onPress={handleTableOptionsPress}
        />

        <ToolbarItem id="filter" pinned={true}>
          <FilterMenu
            alignMenu={align.RIGHT}
            selectedFilterKey={selectedFilterKey}
            filters={filters}
            customFilters={customFilters}
            filterModalConnectorComponent={QueueFilterModal}
            onFilterSelect={handleFilterSelect}
          />
        </ToolbarItem>
      </PageToolbar>

      <PageContentBody>
        <PageHeading scope={translate('Activity')} title={translate('Queue')} />

        {isRefreshing && !isAllPopulated ? <LoadingIndicator /> : null}

        {!isRefreshing && hasError && !records.length ? (
          <Alert kind={kinds.DANGER}>{translate('QueueLoadError')}</Alert>
        ) : null}

        {isAllPopulated && !hasError && !records.length ? (
          <PageMessage>
            {selectedFilterKey !== 'all' && count > 0
              ? translate('QueueFilterHasNoItems')
              : translate('QueueIsEmpty')}
          </PageMessage>
        ) : null}

        {isAllPopulated && !!records.length ? (
          <EpisodeFileProvider episodeFileIds={episodeFileIds}>
            <div>
              {groupBySeries ? (
                <div>
                  {seriesGroups.map((group) => (
                    <QueueSeriesGroup
                      key={group.key}
                      seriesId={group.seriesId}
                      items={group.items}
                      columns={columns}
                      sortKey={sortKey}
                      sortDirection={sortDirection}
                      isExpanded={expandedSeriesState[group.key] ?? true}
                      onExpandPress={handleExpandSeriesPress}
                      onSortPress={handleSortPress}
                      onTableOptionChange={handleTableOptionChange}
                      onQueueRowModalOpenOrClose={
                        handleQueueRowModalOpenOrClose
                      }
                    />
                  ))}
                </div>
              ) : (
                <Table
                  selectAll={true}
                  allSelected={allSelected}
                  allUnselected={allUnselected}
                  columns={columns}
                  pageSize={pageSize}
                  sortKey={sortKey}
                  sortDirection={sortDirection}
                  onTableOptionChange={handleTableOptionChange}
                  onSelectAllChange={handleSelectAllChange}
                  onSortPress={handleSortPress}
                >
                  <TableBody>
                    {records.map((item) => {
                      return (
                        <QueueRow
                          key={item.id}
                          columns={columns}
                          {...item}
                          onQueueRowModalOpenOrClose={
                            handleQueueRowModalOpenOrClose
                          }
                        />
                      );
                    })}
                  </TableBody>
                </Table>
              )}

              <TablePager
                page={page}
                totalPages={totalPages}
                totalRecords={totalRecords}
                isFetching={isFetching && isPlaceholderData}
                onPageSelect={goToPage}
              />
            </div>
          </EpisodeFileProvider>
        ) : null}
      </PageContentBody>

      <RemoveQueueItemModal
        isOpen={isConfirmRemoveModalOpen}
        selectedCount={selectedCount}
        canChangeCategory={
          isConfirmRemoveModalOpen &&
          selectedIds.every((id: number) => {
            const item = records.find((i) => i.id === id);

            return !!(item && item.downloadClientHasPostImportCategory);
          })
        }
        canIgnore={
          isConfirmRemoveModalOpen &&
          selectedIds.every((id: number) => {
            const item = records.find((i) => i.id === id);

            return !!(item && item.seriesId && item.episodeIds.length);
          })
        }
        isPending={
          isConfirmRemoveModalOpen &&
          selectedIds.every((id: number) => {
            const item = records.find((i) => i.id === id);

            if (!item) {
              return false;
            }

            return (
              item.status === 'delay' ||
              item.status === 'downloadClientUnavailable'
            );
          })
        }
        onRemovePress={handleRemoveSelectedConfirmed}
        onModalClose={handleConfirmRemoveModalClose}
      />

      <InteractiveImportModal
        isOpen={isInteractiveImportDownloadIds.length > 0}
        downloadIds={isInteractiveImportDownloadIds}
        title={translate('InteractiveImportMultipleQueueItems')}
        onModalClose={handleImportSelectedModalClose}
      />

      <TableOptionsModal
        isOpen={isTableOptionsModalOpen}
        columns={columns}
        pageSize={pageSize}
        maxPageSize={200}
        onTableOptionChange={handleTableOptionChange}
        onModalClose={handleTableOptionsModalClose}
      />
    </PageContent>
  );
}

function Queue() {
  const { records } = useQueue();

  return (
    <SelectProvider<QueueModel> items={records}>
      <QueueContent />
    </SelectProvider>
  );
}

export default Queue;
