import React, { useCallback, useMemo, useState } from 'react';
import { useSelect } from 'App/Select/SelectContext';
import CheckInput from 'Components/Form/CheckInput';
import Icon from 'Components/Icon';
import Label from 'Components/Label';
import IconButton from 'Components/Link/IconButton';
import Link from 'Components/Link/Link';
import SpinnerIconButton from 'Components/Link/SpinnerIconButton';
import Column from 'Components/Table/Column';
import Table from 'Components/Table/Table';
import TableBody from 'Components/Table/TableBody';
import { useEpisodesWithIds } from 'Episode/useEpisode';
import { icons, kinds } from 'Helpers/Props';
import { SortDirection } from 'Helpers/Props/sortDirections';
import SeriesPoster from 'Series/SeriesPoster';
import SeriesTitleLink from 'Series/SeriesTitleLink';
import { useSingleSeries } from 'Series/useSeries';
import { CheckInputChanged } from 'typings/inputs';
import QueueModel from 'typings/Queue';
import { TableOptionsChangePayload } from 'typings/Table';
import formatBytes from 'Utilities/Number/formatBytes';
import selectUniqueIds from 'Utilities/Object/selectUniqueIds';
import translate from 'Utilities/String/translate';
import QueueRow from './QueueRow';
import RemoveQueueItemModal from './RemoveQueueItemModal';
import {
  useGrabQueueItems,
  useRemoveQueueItems,
  useResumeQueueItems,
} from './useQueue';
import styles from './QueueSeriesGroup.module.css';

interface QueueSeriesGroupProps {
  seriesId?: number;
  items: QueueModel[];
  columns: Column[];
  sortKey: string;
  sortDirection: SortDirection;
  isExpanded: boolean;
  onExpandPress: (seriesKey: string, isExpanded: boolean) => void;
  onSortPress: (sortKey: string, sortDirection?: SortDirection) => void;
  onTableOptionChange: (payload: TableOptionsChangePayload) => void;
  onQueueRowModalOpenOrClose: (isOpen: boolean) => void;
}

function QueueSeriesGroup({
  seriesId,
  items,
  columns,
  sortKey,
  sortDirection,
  isExpanded,
  onExpandPress,
  onSortPress,
  onTableOptionChange,
  onQueueRowModalOpenOrClose,
}: QueueSeriesGroupProps) {
  const series = useSingleSeries(seriesId);
  const seriesKey = seriesId !== undefined ? String(seriesId) : 'unknown';

  const episodeIds = useMemo(() => {
    return selectUniqueIds<QueueModel, number>(items, 'episodeIds');
  }, [items]);

  const episodes = useEpisodesWithIds(episodeIds);

  const { setItemStates, useSelectedIds } = useSelect<QueueModel>();
  const selectedIds = useSelectedIds();

  const { isResuming, resumeQueueItems } = useResumeQueueItems();
  const { isGrabbing, grabQueueItems } = useGrabQueueItems();
  const { isRemoving, removeQueueItems } = useRemoveQueueItems();

  const [isConfirmRemoveModalOpen, setIsConfirmRemoveModalOpen] =
    useState(false);

  const groupItemIds = useMemo(() => items.map((i) => i.id), [items]);

  const selectedInGroup = useMemo(() => {
    const selectedSet = new Set(selectedIds);
    return groupItemIds.filter((id) => selectedSet.has(id));
  }, [groupItemIds, selectedIds]);

  const allGroupSelected =
    groupItemIds.length > 0 && selectedInGroup.length === groupItemIds.length;
  const allGroupUnselected = selectedInGroup.length === 0;

  const groupSelectValue = useMemo(() => {
    if (allGroupSelected) {
      return true;
    }

    if (allGroupUnselected) {
      return false;
    }

    return null;
  }, [allGroupSelected, allGroupUnselected]);

  const pausedIds = useMemo(() => {
    return items.filter((i) => i.status === 'paused').map((i) => i.id);
  }, [items]);

  const pendingIds = useMemo(() => {
    return items
      .filter(
        (i) =>
          i.status === 'delay' || i.status === 'downloadClientUnavailable'
      )
      .map((i) => i.id);
  }, [items]);

  const totalSize = useMemo(() => {
    return items.reduce((sum, item) => sum + (item.size || 0), 0);
  }, [items]);

  const { missingEpisodeCount, withFileEpisodeCount } = useMemo(() => {
    let missing = 0;
    let withFile = 0;

    episodes.forEach((ep) => {
      if (ep.hasFile) {
        withFile++;
      } else {
        missing++;
      }
    });

    return {
      missingEpisodeCount: missing,
      withFileEpisodeCount: withFile,
    };
  }, [episodes]);

  const groupColumns = useMemo(() => {
    return columns.map((col) => {
      if (col.name === 'series.sortTitle') {
        return {
          ...col,
          isVisible: false,
        };
      }

      if (col.name === 'existingQuality') {
        return {
          ...col,
          isVisible: true,
        };
      }

      return col;
    });
  }, [columns]);

  const handleGroupSelectChange = useCallback(
    ({ value }: CheckInputChanged) => {
      setItemStates(
        groupItemIds.map((id) => ({
          id,
          isSelected: !!value,
        }))
      );
    },
    [groupItemIds, setItemStates]
  );

  const handleExpandPress = useCallback(() => {
    onExpandPress(seriesKey, !isExpanded);
  }, [seriesKey, isExpanded, onExpandPress]);

  const handleResumeSeriesPress = useCallback(() => {
    if (pausedIds.length > 0) {
      resumeQueueItems({ ids: pausedIds });
    }
  }, [pausedIds, resumeQueueItems]);

  const handleGrabSeriesPress = useCallback(() => {
    if (pendingIds.length > 0) {
      grabQueueItems({ ids: pendingIds });
    }
  }, [pendingIds, grabQueueItems]);

  const handleRemoveSeriesPress = useCallback(() => {
    onQueueRowModalOpenOrClose(true);
    setIsConfirmRemoveModalOpen(true);
  }, [onQueueRowModalOpenOrClose]);

  const handleRemoveSeriesConfirmed = useCallback(() => {
    onQueueRowModalOpenOrClose(false);
    removeQueueItems({ ids: groupItemIds });
    setIsConfirmRemoveModalOpen(false);
  }, [groupItemIds, removeQueueItems, onQueueRowModalOpenOrClose]);

  const handleConfirmRemoveModalClose = useCallback(() => {
    onQueueRowModalOpenOrClose(false);
    setIsConfirmRemoveModalOpen(false);
  }, [onQueueRowModalOpenOrClose]);

  const seriesTitle = series?.title ?? translate('UnknownSeriesItems');
  const resumeSeriesLabel = translate('ResumeSeries', {
    title: seriesTitle,
  });
  const removeSeriesLabel = translate('RemoveFromQueueWithTitle', {
    title: seriesTitle,
  });

  return (
    <div className={styles.seriesGroup}>
      <div className={styles.header}>
        <div className={styles.left}>
          <CheckInput
            containerClassName={styles.selectInputContainer}
            className={styles.selectInput}
            name={`select-series-${seriesKey}`}
            value={groupSelectValue}
            onChange={handleGroupSelectChange}
          />

          {series ? (
            <Link
              className={styles.posterLink}
              to={`/series/${series.titleSlug}`}
            >
              <SeriesPoster
                className={styles.poster}
                images={series.images}
                size={250}
                lazy={false}
                title={series.title}
              />
            </Link>
          ) : null}

          <div className={styles.seriesInfo}>
            <div className={styles.seriesTitle}>
              {series ? (
                <SeriesTitleLink
                  seriesId={series.id}
                  titleSlug={series.titleSlug}
                  title={series.title}
                />
              ) : (
                <span className={styles.unknownSeries}>
                  {translate('UnknownSeriesItems')}
                </span>
              )}
            </div>

            <div className={styles.seriesStats}>
              <Label className={styles.statLabel} kind={kinds.DEFAULT}>
                {items.length === 1
                  ? translate('QueueItem')
                  : translate('QueueItems', { count: items.length })}
                {episodes.length > 0 ? ` • ${episodes.length} ep` : ''}
              </Label>

              {pausedIds.length > 0 ? (
                <Label className={styles.statLabel} kind={kinds.PRIMARY}>
                  <Icon name={icons.PAUSED} size={11} />
                  {`${pausedIds.length} ${translate('Paused')}`}
                </Label>
              ) : null}

              {missingEpisodeCount > 0 ? (
                <Label className={styles.statLabel} kind={kinds.WARNING}>
                  {`${missingEpisodeCount} ${translate('Missing')}`}
                </Label>
              ) : null}

              {withFileEpisodeCount > 0 ? (
                <Label className={styles.statLabel} kind={kinds.SUCCESS}>
                  {`${withFileEpisodeCount} ${translate('Downloaded')}`}
                </Label>
              ) : null}

              {totalSize > 0 ? (
                <span className={styles.totalSize}>
                  {formatBytes(totalSize)}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <Link
          className={styles.expandButton}
          aria-label={seriesTitle}
          onPress={handleExpandPress}
        >
          <Icon
            className={styles.expandButtonIcon}
            name={isExpanded ? icons.COLLAPSE : icons.EXPAND}
            size={24}
          />
          <span>&nbsp;</span>
        </Link>

        <div className={styles.actions}>
          {pendingIds.length > 0 ? (
            <SpinnerIconButton
              className={styles.actionButton}
              name={icons.DOWNLOAD}
              title={translate('GrabSelected')}
              aria-label={translate('GrabSelected')}
              size={20}
              isSpinning={isGrabbing}
              onPress={handleGrabSeriesPress}
            />
          ) : null}

          <SpinnerIconButton
            className={styles.actionButton}
            name={icons.RESUME}
            title={resumeSeriesLabel}
            aria-label={resumeSeriesLabel}
            size={20}
            isDisabled={pausedIds.length === 0 || isResuming}
            isSpinning={isResuming}
            onPress={handleResumeSeriesPress}
          />

          <SpinnerIconButton
            className={styles.actionButton}
            name={icons.REMOVE}
            title={removeSeriesLabel}
            aria-label={removeSeriesLabel}
            size={20}
            isSpinning={isRemoving}
            onPress={handleRemoveSeriesPress}
          />
        </div>
      </div>

      {isExpanded ? (
        <div className={styles.items}>
          <Table
            selectAll={true}
            allSelected={allGroupSelected}
            allUnselected={allGroupUnselected}
            columns={groupColumns}
            sortKey={sortKey}
            sortDirection={sortDirection}
            onTableOptionChange={onTableOptionChange}
            onSelectAllChange={handleGroupSelectChange}
            onSortPress={onSortPress}
          >
            <TableBody>
              {items.map((item) => (
                <QueueRow
                  key={item.id}
                  columns={groupColumns}
                  {...item}
                  onQueueRowModalOpenOrClose={onQueueRowModalOpenOrClose}
                />
              ))}
            </TableBody>
          </Table>

          <div className={styles.collapseButtonContainer}>
            <IconButton
              iconClassName={styles.collapseButtonIcon}
              name={icons.COLLAPSE}
              size={20}
              title={translate('CollapseAll')}
              aria-label={translate('CollapseAll')}
              onPress={handleExpandPress}
            />
          </div>
        </div>
      ) : null}

      <RemoveQueueItemModal
        isOpen={isConfirmRemoveModalOpen}
        selectedCount={items.length}
        canChangeCategory={
          isConfirmRemoveModalOpen &&
          items.every((item) => !!item.downloadClientHasPostImportCategory)
        }
        canIgnore={
          isConfirmRemoveModalOpen &&
          items.every((item) => !!(item.seriesId && item.episodeIds.length))
        }
        isPending={
          isConfirmRemoveModalOpen &&
          items.every(
            (item) =>
              item.status === 'delay' ||
              item.status === 'downloadClientUnavailable'
          )
        }
        onRemovePress={handleRemoveSeriesConfirmed}
        onModalClose={handleConfirmRemoveModalClose}
      />
    </div>
  );
}

export default QueueSeriesGroup;
